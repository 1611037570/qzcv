import { Body, Controller, Get, Headers, Post, Req, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { BillingService } from '../billing/billing.service'
import { resolveClientIdentity } from '../shared/client-identity'
import { LLMService } from './llm.service'
import { LlmUsageService, type LlmUsageResult } from './llm-usage.service'
import { LlmStatusService } from './llm-status.service'

// 中英文混合内容按约 1.5 个字符一个令牌粗估，仅在上游没有回传用量时兜底
const CHARS_PER_TOKEN = 1.5

/**
 * 把上游错误归类成给用户看的中文结论。
 * 鉴权、地址这类属于服务端配置问题统一转成网关错误，避免把 401 直接暴露给浏览器。
 */
function describeUpstreamFailure(status: number) {
  if (status === 429) return { status: 429, code: 'rate_limited', message: 'AI 服务请求过于频繁，请稍后再试' }
  if (status === 401 || status === 403) {
    return { status: 502, code: 'upstream_auth_failed', message: 'AI 服务鉴权失败，请联系管理员检查密钥' }
  }
  if (status === 404) return { status: 502, code: 'upstream_not_found', message: 'AI 服务接口地址不正确，请联系管理员检查配置' }
  if (status >= 500) return { status: 502, code: 'upstream_unavailable', message: 'AI 服务暂时不可用，请稍后重试' }
  return { status: 502, code: 'upstream_rejected', message: 'AI 服务暂时无法完成这次请求，请稍后重试' }
}

// 从流式响应中解析到的用量
type ParsedUsage = {
  promptTokens: number // 输入消耗令牌数
  completionTokens: number // 输出消耗令牌数
  totalTokens: number // 本次消耗令牌总数
}

@ApiTags('LLM 接口')
@Controller('llm')
export class LLMController {
  constructor(
    private readonly llmService: LLMService,
    private readonly usageService: LlmUsageService,
    // 钱包有余额时按输入/输出、模型倍率与时段倍率结算扣减
    private readonly billingService: BillingService,
    // 上游健康度与额度状态，供面板展示（与用户余额无关）
    private readonly statusService: LlmStatusService,
  ) {}

  @ApiOperation({ summary: 'AI 流式对话' })
  @Post('stream')
  async chatStream(
    @Body() data: Record<string, any>,
    @Req() req: Request,
    @Res() res: Response,
    // 访问凭证：有余额就从凭证扣，没有凭证继续走免费额度
    @Headers('x-license-key') licenseKey?: string,
  ) {
    // 空请求体没有转发价值，直接拒绝以免占用上游额度
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return res.status(400).send('请求体不能为空')
    }

    const identity = resolveClientIdentity(req)
    // 浏览器断开后立即中止上游，否则服务端会继续读取并计费
    const abortController = new AbortController()
    res.on('close', () => abortController.abort())

    let usage: ParsedUsage | null = null
    let outputChars = 0
    let streamStarted = false
    // 上游状态埋点：状态码用于区分故障与限流
    let upstreamStatus = 0
    let upstreamFailed = false

    try {
      const upstreamRes = await this.llmService.getUpstreamResponse(data, abortController.signal)
      upstreamStatus = upstreamRes.status

      if (!upstreamRes.ok) {
        // 上游原始错误只留在服务端日志，浏览器只拿到可读结论
        upstreamFailed = true
        const errorText = await upstreamRes.text()
        console.error('上游返回错误', upstreamRes.status, errorText)
        const failure = describeUpstreamFailure(upstreamRes.status)
        return res.status(failure.status).send({ error: { code: failure.code, message: failure.message } })
      }

      if (!upstreamRes.body) {
        throw new Error('上游响应体为空')
      }

      streamStarted = true

      // 正常响应按上游返回的类型透传，保持流式格式
      const contentType = upstreamRes.headers.get('content-type') || 'text/event-stream'

      res.status(200)
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      // 告诉中间代理（如 Nginx）不要缓存，直接透传流
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      const reader = upstreamRes.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let pending = ''

      // 单行解析：只读用量与正文长度，不改动转发中的原始字节
      const handleLine = (line: string) => {
        const text = line.trim()
        if (!text.startsWith('data:')) return
        const payload = text.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        try {
          const event = JSON.parse(payload)
          if (event?.usage) {
            usage = {
              promptTokens: Number(event.usage.prompt_tokens ?? 0),
              completionTokens: Number(event.usage.completion_tokens ?? 0),
              totalTokens: Number(event.usage.total_tokens ?? 0),
            }
          }
          const delta = event?.choices?.[0]?.delta?.content
          if (typeof delta === 'string') outputChars += delta.length
        } catch {
          // 单行不是合法 JSON 说明是上游的注释或分片边界，交给原始字节继续转发
        }
      }

      // 边转发边解析，保留未结束的行等待下一个分片
      const inspect = (chunk: Uint8Array) => {
        pending += decoder.decode(chunk, { stream: true })
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        lines.forEach(handleLine)
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        inspect(value)
        res.write(value)
      }

      // 冲刷解码器与行缓冲的尾部，避免最后一行没有换行时漏掉用量
      pending += decoder.decode()
      if (pending.trim()) handleLine(pending)
    } catch (error) {
      // 客户端主动断开属于正常结束，不按错误处理
      if (!abortController.signal.aborted) {
        upstreamFailed = true
        const message = error instanceof Error ? error.message : String(error)
        console.error('中转流出错:', message)
        if (!res.headersSent) {
          // 连接上游失败同样只回可读结论，原始原因留在日志
          res.status(502).send({ error: { code: 'relay_failed', message: 'AI 服务连接失败，请稍后重试' } })
        }
      }
    } finally {
      // 成功、失败、客户端断开都记录一次，面板据最近窗口判断服务是否可用
      this.statusService.record({
        ok: !upstreamFailed,
        status: upstreamStatus,
      })
    }

    // 已经向上游发起过请求就一定有消耗，估算值用于上游未回传用量的情况
    if (streamStarted) {
      await this.recordUsage(identity, data, usage, outputChars, licenseKey)
    }

    // 出错分支可能已经发送并结束响应，这里只在尚未结束时收尾
    if (!res.writableEnded) res.end()
  }

  @ApiOperation({ summary: '上游服务状态与额度（内部探测，非用户余额）' })
  @Get('service-status')
  serviceStatus() {
    return this.statusService.snapshot()
  }

  @ApiOperation({ summary: '查询当前使用者的免费额度消耗' })
  @Get('usage')
  usage(@Req() req: Request) {
    const identity = resolveClientIdentity(req)
    return this.usageService.summary(identity.clientKey)
  }

  // 上游没有回传用量时按字符数估算，宁可高估也不要漏记
  private buildUsage(data: Record<string, any>, usage: ParsedUsage | null, outputChars: number): LlmUsageResult {
    if (usage && usage.totalTokens > 0) {
      return { ...usage, estimated: false }
    }

    const inputChars = JSON.stringify(data).length
    const promptTokens = Math.ceil(inputChars / CHARS_PER_TOKEN)
    const completionTokens = Math.ceil(outputChars / CHARS_PER_TOKEN)
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimated: true,
    }
  }

  private async recordUsage(
    identity: { clientKey: string; ipHash: string },
    data: Record<string, any>,
    usage: ParsedUsage | null,
    outputChars: number,
    licenseKey?: string,
  ) {
    // 记录本次实际使用的上游模型，而不是前端传入的标识
    const model = this.llmService.resolveModel(data?.model)
    const settled = this.buildUsage(data, usage, outputChars)

    await this.usageService.record({
      clientKey: identity.clientKey,
      ipHash: identity.ipHash,
      model,
      usage: settled,
    })

    // 余额归属于凭证：凭证有效才扣减，缺失或无效继续走免费额度，不阻断对话
    await this.billingService.settle(licenseKey, {
      model,
      promptTokens: settled.promptTokens,
      completionTokens: settled.completionTokens,
    })
  }
}
