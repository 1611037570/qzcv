import { Injectable } from '@nestjs/common'
import {
  BILLING_TOKENS_PER_YUAN,
  MICRO_YUAN_PER_YUAN,
  billingConfig,
  type BillingModelPrice,
  type BillingTimeRule,
} from '../../configs/billing.config'

// 一次用量的计费结果，扣费与流水都以此为准
export type BillingQuote = {
  /** 本次应扣的计费令牌。 */
  billedTokens: number
  /** 按标准售价计算的金额（微元），未做单次上限截断。 */
  listPriceMicro: number
  /** 上游成本（微元），只用于毛利监控。 */
  upstreamCostMicro: number
  /** 命中的模型倍率。 */
  modelRatio: number
  /** 命中的时段倍率。 */
  timeRatio: number
  /** 命中的时段名称。 */
  timeLabel: string
  /** 输入售价（元 / 百万令牌）。 */
  inputPerMillion: number
  /** 输出售价（元 / 百万令牌）。 */
  outputPerMillion: number
  /** 实际命中的定价键，未单独配置时回退 default。 */
  priceKey: string
  /** 是否被单次扣除上限截断。 */
  clamped: boolean
}

// 对外展示的定价快照，前端据此说明当前倍率与兑换关系
export type BillingPricingSnapshot = {
  /** 1 元可兑换的基础计费令牌数。 */
  tokensPerYuan: number
  /** 当前时段倍率。 */
  timeRatio: number
  /** 当前时段名称。 */
  timeLabel: string
  /** 当前时段的起止小时，左闭右开。 */
  startHour: number
  /** 当前时段的结束小时。 */
  endHour: number
  /** 标准模型的输入售价（元 / 百万令牌）。 */
  inputPerMillion: number
  /** 标准模型的输出售价（元 / 百万令牌）。 */
  outputPerMillion: number
  /** 标准模型的模型倍率。 */
  modelRatio: number
  /** 单次请求最多扣除的计费令牌。 */
  maxChargeTokensPerRequest: number
  /** 目标毛利率，供前端解释定价逻辑。 */
  targetMarginRate: number
}

// 一计费令牌折合的微元数，1 元 = 200000 令牌时即为 5 微元
const MICRO_PER_TOKEN = MICRO_YUAN_PER_YUAN / BILLING_TOKENS_PER_YUAN

@Injectable()
export class BillingPricingService {
  // 计费时区的小时格式化器：Intl 构造开销较大，实例复用到整个进程
  private readonly hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: billingConfig.timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  })

  // 已经提示过未单独定价的模型，避免每条请求刷日志
  private readonly warnedModels = new Set<string>()

  constructor() {
    // 定价亏损属于财务事故，必须在服务对外提供前暴露出来
    this.auditPricing()
  }

  /**
   * 取实际模型的定价。
   * 未单独配置的模型统一回退 default，避免新增模型时漏配导致免费。
   */
  resolvePrice(model: string): { priceKey: string; price: BillingModelPrice } {
    const configured = billingConfig.models[model]
    if (configured) return { priceKey: model, price: configured }

    // 回退 default 时提示一次：否则会误以为已经按模型区分了价格
    if (model && !this.warnedModels.has(model)) {
      this.warnedModels.add(model)
      console.warn(`模型 ${model} 未单独定价，按 default 计费；需要区分请在 billing.config.ts 的 models 中补充`)
    }
    return { priceKey: 'default', price: billingConfig.models.default }
  }

  // 按时段取倍率，未命中任何区间时按原价计费
  resolveTimeRule(at: Date = new Date()): BillingTimeRule {
    const hour = this.readHour(at)
    const matched = billingConfig.timeRules.find((rule) => hour >= rule.startHour && hour < rule.endHour)
    return matched ?? { startHour: 0, endHour: 24, ratio: 1, label: '标准时段' }
  }

  // 按配置时区读取小时：容器默认 UTC 时不能让时段倍率整体偏移
  private readHour(at: Date) {
    // hourCycle 固定 h23，保证结果落在 00-23，不会出现 24 点
    return Number(this.hourFormatter.format(at))
  }

  /**
   * 计算一次用量的扣费。
   * 输入与输出分开计价：输出单价更高，同样令牌数扣得更多；再叠加模型倍率与时段倍率。
   */
  quote(input: {
    /** 实际调用的上游模型名。 */
    model: string
    /** 输入消耗令牌数。 */
    promptTokens: number
    /** 输出消耗令牌数。 */
    completionTokens: number
    /** 计费时间，缺省取当前时间。 */
    at?: Date
  }): BillingQuote {
    const { priceKey, price } = this.resolvePrice(input.model)
    const timeRule = this.resolveTimeRule(input.at)
    // 令牌数只接受非负整数，防止异常用量反向增加余额
    const promptTokens = Math.max(0, Math.floor(input.promptTokens))
    const completionTokens = Math.max(0, Math.floor(input.completionTokens))

    // 微元金额 = 令牌数 × 元/百万令牌：令牌数 / 1e6 × 单价 × 1e6 正好约掉百万基数
    const inputMicro = promptTokens * price.inputPerMillion
    const outputMicro = completionTokens * price.outputPerMillion
    const listPriceMicro = Math.ceil((inputMicro + outputMicro) * price.ratio * timeRule.ratio)

    const rawTokens = Math.ceil(listPriceMicro / MICRO_PER_TOKEN)
    const billedTokens = Math.min(rawTokens, billingConfig.maxChargeTokensPerRequest)

    return {
      billedTokens,
      listPriceMicro,
      upstreamCostMicro: Math.ceil(
        promptTokens * billingConfig.upstreamCost.inputPerMillion +
          completionTokens * billingConfig.upstreamCost.outputPerMillion,
      ),
      modelRatio: price.ratio,
      timeRatio: timeRule.ratio,
      timeLabel: timeRule.label,
      inputPerMillion: price.inputPerMillion,
      outputPerMillion: price.outputPerMillion,
      priceKey,
      clamped: rawTokens > billedTokens,
    }
  }

  // 当前定价快照，用于余额卡片展示兑换关系与时段倍率
  snapshot(at: Date = new Date()): BillingPricingSnapshot {
    const timeRule = this.resolveTimeRule(at)
    const { price } = this.resolvePrice('')
    return {
      tokensPerYuan: BILLING_TOKENS_PER_YUAN,
      timeRatio: timeRule.ratio,
      timeLabel: timeRule.label,
      startHour: timeRule.startHour,
      endHour: timeRule.endHour,
      inputPerMillion: price.inputPerMillion,
      outputPerMillion: price.outputPerMillion,
      modelRatio: price.ratio,
      maxChargeTokensPerRequest: billingConfig.maxChargeTokensPerRequest,
      targetMarginRate: billingConfig.targetMarginRate,
    }
  }

  /**
   * 启动期毛利校验：按最不利时段与最大套餐折扣核算每个模型、每个套餐的毛利率。
   * 亏损项直接中断启动，低于目标毛利只告警。
   */
  private auditPricing() {
    const { payment, targetMarginRate } = billingConfig
    // 扣除通道费与拒付预提后真正到手的比例
    const netRate = 1 - payment.feeRate - payment.refundLossRate
    // 折扣叠加的最坏情况：最低时段倍率
    const worstTimeRatio = Math.min(...billingConfig.timeRules.map((rule) => rule.ratio))
    const losses: string[] = []
    const warnings: string[] = []

    const audit = (label: string, revenueYuan: number, costYuan: number) => {
      const netYuan = revenueYuan * netRate
      const margin = netYuan > 0 ? (netYuan - costYuan) / netYuan : -1
      const line = `${label}：到手 ${netYuan.toFixed(3)} 元 / 成本 ${costYuan.toFixed(3)} 元 / 毛利率 ${(margin * 100).toFixed(1)}%`
      if (margin < 0) losses.push(line)
      else if (margin < targetMarginRate) warnings.push(line)
      return { margin, line }
    }

    // 以百万令牌为单位比较，结论与订单大小无关
    for (const [key, price] of Object.entries(billingConfig.models)) {
      const timeFactor = worstTimeRatio * price.ratio
      const input = audit(`模型 ${key} 输入`, price.inputPerMillion * timeFactor, billingConfig.upstreamCost.inputPerMillion)
      const output = audit(`模型 ${key} 输出`, price.outputPerMillion * timeFactor, billingConfig.upstreamCost.outputPerMillion)
      console.log(`💰 定价校验 模型 ${key}：输入毛利率 ${(input.margin * 100).toFixed(1)}% / 输出毛利率 ${(output.margin * 100).toFixed(1)}%`)
    }

    for (const item of billingConfig.packages) {
      // 套餐折扣 = 实付金额 / 到账令牌按标准价折算的金额，赠送越多折扣越低
      const listValueFen = (item.tokens / BILLING_TOKENS_PER_YUAN) * 100
      const discount = listValueFen > 0 ? item.amountFen / listValueFen : 1
      const price = billingConfig.models.default
      const timeFactor = worstTimeRatio * price.ratio * discount
      const input = audit(`套餐 ${item.packageId} 输入`, price.inputPerMillion * timeFactor, billingConfig.upstreamCost.inputPerMillion)
      const output = audit(`套餐 ${item.packageId} 输出`, price.outputPerMillion * timeFactor, billingConfig.upstreamCost.outputPerMillion)
      console.log(`💰 定价校验 套餐 ${item.packageId}（${item.amountFen} 分 / ${item.tokens} 令牌）：输入毛利率 ${(input.margin * 100).toFixed(1)}% / 输出毛利率 ${(output.margin * 100).toFixed(1)}%`)
    }

    if (warnings.length && !losses.length) {
      console.warn(`充值定价低于目标毛利率 ${(targetMarginRate * 100).toFixed(0)}%，请复核：\n${warnings.join('\n')}`)
    }

    if (losses.length && !billingConfig.allowLossPricing) {
      throw new Error(
        `充值定价存在亏损项，服务拒绝启动。请调整 billing.config.ts 的售价或倍率：\n${losses.join('\n')}`,
      )
    }
  }
}
