import { Injectable } from '@nestjs/common'
import { config } from '../../configs'

// 统计窗口：只看最近 5 分钟，反映「现在」而不是历史累计
const WINDOW_MS = 5 * 60 * 1000
// 样本上限，防止瞬时高并发把内存撑满
const MAX_SAMPLES = 500
// 额度探测结果缓存，避免每次打开面板都去打上游
const QUOTA_CACHE_MS = 60 * 1000
// 额度探测超时，上游无响应时不能拖住状态接口
const QUOTA_TIMEOUT_MS = 5000
// 失败率超过该比例判定为波动
const DEGRADED_FAILURE_RATE = 0.1
// 失败率超过该比例且样本足够时判定为不可用
const DOWN_FAILURE_RATE = 0.5
// 判定不可用所需的最少样本数，避免一两次失败就报故障
const DOWN_MIN_SAMPLES = 3

// 服务健康等级：ready 表示配置完整但窗口内还没有请求，不能与「异常」混为一谈
export type LlmServiceHealth = 'ready' | 'healthy' | 'degraded' | 'down' | 'unknown'

// 上游额度等级：unknown 表示上游未开放查询
export type LlmQuotaLevel = 'enough' | 'low' | 'empty' | 'unknown'

// 服务状态快照：只把结论交给前端，模型名、额度、请求量都属于内部诊断信息
export type LlmServiceStatus = {
  /** 服务状态结论。 */
  level: LlmServiceHealth
}

// 单次请求的观测样本
type RequestSample = {
  /** 记录时间。 */
  at: number
  /** 是否成功。 */
  ok: boolean
  /** 上游 HTTP 状态码，网络错误为 0。 */
  status: number
}

/**
 * 上游服务状态。
 * 这里统计的是「我们对接的上游」是否健康、额度是否够用，
 * 与用户凭证余额无关，也不暴露任何密钥或上游地址。
 */
@Injectable()
export class LlmStatusService {
  private samples: RequestSample[] = []
  private quotaCache: { at: number; level: LlmQuotaLevel } | null = null
  // 同时打开多个面板时只发起一次探测
  private probing: Promise<LlmQuotaLevel> | null = null

  // 记录一次对话请求的结果，由转发层在请求结束时调用
  record(input: { ok: boolean; status: number }) {
    const now = Date.now()
    this.samples.push({ at: now, ...input })

    // 控制总量，再按窗口裁剪，两次操作都很轻
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES)
    }
    const cutoff = now - WINDOW_MS
    while (this.samples.length && this.samples[0].at < cutoff) {
      this.samples.shift()
    }
  }

  // 生成状态快照；额度探测有缓存，接口本身不会被上游拖慢
  async snapshot(): Promise<LlmServiceStatus> {
    const configured = Boolean(config.ai.apiKey && config.ai.baseUrl && config.ai.assistantModel)
    const samples = this.samples
    const requests = samples.length
    const failures = samples.filter((item) => !item.ok).length
    const rateLimited = samples.filter((item) => item.status === 429).length
    // 额度只用于判断「我们这边还能不能继续提供服务」，不对外展示具体数值
    const quota = configured ? await this.readQuota() : 'unknown'

    return {
      level: this.resolveLevel(configured, quota, requests, failures, rateLimited),
    }
  }

  /**
   * 判定服务等级。
   * 额度用尽等同于服务不可用，额度偏低提前降级提示；
   * 其余按最近窗口的失败率与限流情况判断。
   */
  private resolveLevel(
    configured: boolean,
    quota: LlmQuotaLevel,
    requests: number,
    failures: number,
    rateLimited: number,
  ): LlmServiceHealth {
    if (!configured) return 'down'
    if (quota === 'empty') return 'down'

    if (requests > 0) {
      const failureRate = failures / requests
      if (failureRate > DOWN_FAILURE_RATE && requests >= DOWN_MIN_SAMPLES) return 'down'
      if (rateLimited > 0 || failureRate > DEGRADED_FAILURE_RATE) return 'degraded'
    }

    // 当前请求都成功但额度已经偏低，也提前给出提示
    if (quota === 'low') return 'degraded'
    return requests === 0 ? 'ready' : 'healthy'
  }

  // 读取额度，命中缓存直接返回；探测失败也缓存，避免持续打上游
  private async readQuota(): Promise<LlmQuotaLevel> {
    if (this.quotaCache && Date.now() - this.quotaCache.at < QUOTA_CACHE_MS) {
      return this.quotaCache.level
    }
    if (this.probing) return this.probing

    this.probing = this.probeQuota().finally(() => {
      this.probing = null
    })
    const level = await this.probing
    this.quotaCache = { at: Date.now(), level }
    return level
  }

  /**
   * 向上游查询余额。
   * 只有显式配置了 OPENAI_BALANCE_URL，或地址是 DeepSeek 官方时才会发起请求，
   * 避免向未知的第三方中转地址发送带密钥的请求。
   */
  private async probeQuota(): Promise<LlmQuotaLevel> {
    const url = this.resolveQuotaUrl()
    if (!url) return 'unknown'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), QUOTA_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.ai.apiKey}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        console.warn('上游额度查询失败', response.status)
        return 'unknown'
      }

      const data = (await response.json()) as Record<string, any>
      const total = this.readBalance(data)
      if (total === null) return 'unknown'
      if (total <= 0) return 'empty'
      return total < config.ai.quotaLowYuan ? 'low' : 'enough'
    } catch (error) {
      // 上游没有额度接口或网络不通都属于正常情况，只记录不抛错
      console.warn('上游额度查询异常', error instanceof Error ? error.message : error)
      return 'unknown'
    } finally {
      clearTimeout(timer)
    }
  }

  // 兼容常见返回结构：DeepSeek 用 balance_infos，部分中转直接给 balance
  private readBalance(data: Record<string, any>): number | null {
    const candidates = [
      data?.balance_infos?.[0]?.total_balance,
      data?.total_balance,
      data?.balance,
    ]
    for (const value of candidates) {
      const balance = Number(value)
      if (Number.isFinite(balance)) return balance
    }
    return null
  }

  // 显式配置优先；未配置时只对 DeepSeek 官方域名推导，其他地址一律不探测
  private resolveQuotaUrl() {
    if (config.ai.balanceUrl) return config.ai.balanceUrl
    try {
      const url = new URL(config.ai.baseUrl)
      if (url.hostname !== 'api.deepseek.com') return ''
      return `${url.origin}/user/balance`
    } catch {
      // 地址不合法时直接放弃探测，配置问题由调用方自身的报错暴露
      return ''
    }
  }
}
