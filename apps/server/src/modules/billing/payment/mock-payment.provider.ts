import { Injectable } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { billingConfig } from '../../../configs/billing.config'
import type {
  PaymentCallbackPayload,
  PaymentIntent,
  PaymentOrderInput,
  PaymentProvider,
} from './payment.types'

// 回调时间戳允许的偏移，超过该窗口视为重放
const CALLBACK_TIME_WINDOW_MS = 5 * 60 * 1000

// 模拟支付渠道：不产生真实资金，只走完整的下单与回调链路，便于联调与验收
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly channel = 'mock'

  // 模拟渠道没有真实收银台，返回约定前缀的地址供前端识别并走本地支付
  async create(input: PaymentOrderInput): Promise<PaymentIntent> {
    return {
      channel: this.channel,
      payUrl: `mock://pay/${input.orderNo}`,
    }
  }

  /**
   * 解析模拟回调。
   * 签名规则与真实渠道保持一致：对关键字段做 HMAC，任何字段被篡改都无法通过。
   */
  parseCallback(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentCallbackPayload | null {
    const signature = this.readHeader(headers, 'x-mock-signature')
    if (!signature || !rawBody.length) return null
    if (!this.safeEqual(signature, this.sign(rawBody))) return null

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody.toString('utf8'))
    } catch {
      // 回调体必须是合法 JSON，解析失败说明请求被改写
      return null
    }

    const orderNo = typeof body.orderNo === 'string' ? body.orderNo : ''
    const providerTxnId = typeof body.providerTxnId === 'string' ? body.providerTxnId : ''
    const amountFen = Number(body.amountFen)
    const paidAt = new Date(String(body.paidAt ?? ''))
    if (!orderNo || !providerTxnId || !Number.isInteger(amountFen) || amountFen <= 0) return null
    if (Number.isNaN(paidAt.getTime())) return null
    // 时间戳窗口用于拦截重放的回调体
    if (Math.abs(Date.now() - paidAt.getTime()) > CALLBACK_TIME_WINDOW_MS) return null

    return { orderNo, providerTxnId, amountFen, paidAt }
  }

  /**
   * 按模拟渠道的签名规则生成一份回调请求。
   * 仅用于本地「模拟支付」按钮，让发放流程完整走一遍验签与幂等逻辑。
   */
  buildCallback(input: { orderNo: string; amountFen: number }): {
    rawBody: Buffer
    headers: Record<string, string>
  } {
    const rawBody = Buffer.from(
      JSON.stringify({
        orderNo: input.orderNo,
        providerTxnId: `MOCK${input.orderNo}`,
        amountFen: input.amountFen,
        paidAt: new Date().toISOString(),
      }),
      'utf8',
    )
    return {
      rawBody,
      headers: { 'x-mock-signature': this.sign(rawBody) },
    }
  }

  // 对原始请求体做 HMAC-SHA256，真实渠道换成渠道密钥与渠道算法即可
  private sign(rawBody: Buffer) {
    return createHmac('sha256', billingConfig.mockSecret).update(rawBody).digest('hex')
  }

  // 常数时间比较，避免通过响应时间推断签名
  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    if (leftBuffer.length !== rightBuffer.length) return false
    return timingSafeEqual(leftBuffer, rightBuffer)
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name]
    return Array.isArray(value) ? value[0] ?? '' : value ?? ''
  }
}
