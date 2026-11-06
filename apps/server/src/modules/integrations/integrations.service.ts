import { Injectable } from '@nestjs/common'
import { config } from '../../configs'

// 仓库星标缓存条目
type StarsCache = {
  stars: number; // 仓库 Star 总数
  updatedAt: number; // 最近一次成功获取的时间戳
}

@Injectable()
export class IntegrationsService {
  // 星标缓存保留在进程内，避免每个访问者都触发上游配额
  private starsCache: StarsCache | null = null

  /**
   * 请求第三方并返回 JSON，超时统一由 services 配置控制
   */
  private async requestJson(url: string, headers: Record<string, string> = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.integrations.timeout)
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`上游请求失败（HTTP ${response.status}）`)
      const data = await response.json()
      return data
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 查询固定仓库星标，结果按配置的时间缓存
   */
  async getGithubStars() {
    const { starsCacheTtl } = config.integrations.github
    const now = Date.now()
    if (this.starsCache && now - this.starsCache.updatedAt < starsCacheTtl) {
      return this.starsCache
    }
    // 固定查询项目仓库，避免配置或路径编码错误
    const url = 'https://api.github.com/repos/1611037570/qzcv'
    const data = await this.requestJson(url, { Accept: 'application/vnd.github+json' })
    // 零颗 Star 也是有效结果，拒绝异常数字后再进入缓存
    if (!Number.isSafeInteger(data?.stargazers_count) || data.stargazers_count < 0) {
      throw new Error('仓库星标数据无效')
    }
    this.starsCache = { stars: data.stargazers_count, updatedAt: now }
    return this.starsCache
  }
}
