/**
 * 支付渠道适配层。
 * 接入微信、支付宝等真实渠道时，只需实现本接口并在 billing.module.ts 替换提供者，
 * 下单、回调验签、幂等发放、令牌入账等业务逻辑都不需要改动。
 */

// 下单入参：金额由服务端定价后传入，渠道只负责收款
export type PaymentOrderInput = {
  /** 本地订单号，回调时按它对账。 */
  orderNo: string
  /** 应付金额（分）。 */
  amountFen: number
  /** 支付标题，展示在收银台。 */
  subject: string
  /** 订单支付截止时间。 */
  expireAt: Date
}

// 下单结果：前端据此跳转收银台或渲染二维码
export type PaymentIntent = {
  /** 渠道标识，与回调地址中的渠道参数一致。 */
  channel: string
  /** 收银台地址或二维码内容，模拟渠道使用 mock:// 前缀。 */
  payUrl: string
}

// 回调解析结果：验签通过后才会返回，业务层只信任这里的字段
export type PaymentCallbackPayload = {
  /** 渠道回传的本地订单号。 */
  orderNo: string
  /** 渠道交易号，写入唯一索引用于兜底幂等。 */
  providerTxnId: string
  /** 渠道实收金额（分），必须与本地订单完全一致。 */
  amountFen: number
  /** 渠道支付完成时间。 */
  paidAt: Date
}

export interface PaymentProvider {
  /** 渠道标识，用于校验回调地址与配置是否匹配。 */
  readonly channel: string

  /** 创建支付：真实渠道在此调用预下单或 Checkout 接口。 */
  create(input: PaymentOrderInput): Promise<PaymentIntent>

  /**
   * 用原始请求体验签并解析回调。
   * 必须基于原始字节验签，不能先反序列化再拼装，否则签名无法通过。
   * 验签失败或字段缺失时返回 null，由调用方统一拒绝。
   */
  parseCallback(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): PaymentCallbackPayload | null
}

// Nest 依赖注入令牌：业务层只依赖接口，不关心具体渠道
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')
