import { createHash } from 'node:crypto'
import type { Request } from 'express'

// 匿名使用者标识：没有账号体系时用 IP 与设备标识推导，钱包、用量记录与风控共用同一口径
export type ClientIdentity = {
  /** 使用者稳定标识，用于归属钱包与用量记录，不落明文地址。 */
  clientKey: string
  /** 来源 IP 哈希，仅作风险信号使用。 */
  ipHash: string
}

/**
 * 从请求推导匿名身份。
 * 服务只监听回环地址，真实来源取自 Nginx 写入的转发头。
 *
 * 注意：这里的结果只用于用量统计与下单限流，**不再用于余额归属**。
 * 余额归属于用户手持的访问凭证（见 modules/billing），
 * 因此升级浏览器、切换网络都不会影响已充值的余额。
 */
export function resolveClientIdentity(req: Request): ClientIdentity {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  const ip = forwarded || req.ip || ''
  const ua = String(req.headers['user-agent'] ?? '')
  return {
    clientKey: hash(`${ip}|${ua}`),
    ipHash: hash(ip),
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
