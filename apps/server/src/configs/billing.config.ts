import { envString } from './env'

// 计费令牌与人民币的固定兑换关系：1 元 = 200000 计费令牌，即 1 计费令牌 = 5 微元。
// 售价按「微元」计算后再折算成令牌，避免浮点误差累积。
export const BILLING_TOKENS_PER_YUAN = 200000

// 微元换算基数：1 元 = 1000000 微元。
export const MICRO_YUAN_PER_YUAN = 1_000_000

// 运行环境标识，未显式指定时按本地开发处理。
const runtimeMode = process.env.NODE_ENV || 'development'

// 模拟支付默认值：生产环境关闭，本地与测试开启，避免上线后忘记关闭导致可白拿令牌。
const defaultMockPayment = runtimeMode === 'production' ? '0' : '1'

// 单个模型的定价，售价与成本分开维护：售价决定扣多少令牌，成本只用于毛利核算。
export type BillingModelPrice = {
  /** 输入售价（元 / 百万令牌）。 */
  inputPerMillion: number
  /** 输出售价（元 / 百万令牌），生成内容更贵所以高于输入。 */
  outputPerMillion: number
  /** 模型倍率，叠加在售价之上，用于单独上调或促销。 */
  ratio: number
}

// 时段倍率规则，按服务器本地小时匹配左闭右开区间。
export type BillingTimeRule = {
  /** 生效起始小时（含）。 */
  startHour: number
  /** 生效结束小时（不含）。 */
  endHour: number
  /** 该时段的计费倍率。 */
  ratio: number
  /** 时段名称，用于前端展示当前倍率。 */
  label: string
}

// 套餐定义。套餐在代码中定价，下单时把名称、金额、到账令牌快照进订单表，改价不影响历史订单。
export type BillingPackage = {
  /** 套餐标识，下单时由前端提交，服务端据此查价。 */
  packageId: string
  /** 套餐展示名称。 */
  name: string
  /** 售价（分），服务端定价，不信任前端。 */
  amountFen: number
  /** 到账计费令牌，已包含赠送部分。 */
  tokens: number
  /** 相对基础单价的赠送比例，仅用于展示与毛利校验。 */
  bonusRate: number
  /** 角标文案，空串表示不展示。 */
  badge: string
  /** 展示排序，越小越靠前。 */
  sort: number
}

/**
 * 充值计费配置。
 * 价格与倍率只在这里维护：改价属于财务动作，必须经过代码评审并重启，不接受前端或数据库下发。
 */
export const billingConfig = {
  // 任意 24 小时内可创建的订单数上限，抑制批量刷单与拒付风险。
  // 用滚动窗口而不是自然日，避免数据库时区与业务时区不一致导致额度提前刷新；
  // 只统计待支付与已支付订单，已关闭的过期单不占额度。
  dailyOrderLimit: 10,
  // 订单未支付的有效期（分钟），超时后按关闭处理。
  orderExpireMinutes: 15,
  // 时段倍率与业务日判断统一使用该时区，容器默认 UTC 时不会让高峰倍率错位。
  timeZone: 'Asia/Shanghai',
  // 是否允许模拟支付：生产环境默认关闭，本地与测试默认开启，显式设置的环境变量优先。
  mockPayment: envString('BILLING_MOCK_PAYMENT', defaultMockPayment) === '1',
  // 模拟支付签名密钥，仅开发环境使用，接入真实渠道后由渠道密钥替代。
  mockSecret: envString('BILLING_MOCK_SECRET', 'snowflake-mock-pay'),
  // 访问凭证配置：余额只归属于凭证本身，不再依赖 IP 与设备标识推导账户
  license: {
    // 凭证前缀，便于人工识别与输入校验
    prefix: 'SF',
    // 凭证公开部分长度，用于查库定位
    keyIdLength: 8,
    // 凭证密文长度，直接决定暴力破解成本
    secretLength: 24,
    // 服务端哈希密钥：只存哈希不存明文；更换后所有旧凭证立即失效
    pepper: envString('BILLING_LICENSE_PEPPER', 'snowflake-license-pepper'),
  },
  // 单次请求最多扣除的计费令牌，防止异常用量一次掏空余额。
  maxChargeTokensPerRequest: 200000,
  // 支付损耗：通道费与拒付预提，任何毛利计算都必须先扣掉这两项，否则账面赚钱实际亏钱。
  payment: {
    /** 支付通道费率。 */
    feeRate: 0.006,
    /** 拒付与坏账预提比例。 */
    refundLossRate: 0.02,
  },
  // 目标毛利率，低于该值只告警不阻断启动。
  targetMarginRate: 0.25,
  // 毛利率低于 0 视为定价亏损，启动即失败，避免带着亏本价格对外服务。
  allowLossPricing: false,
  // 上游成本价（元 / 百万令牌），只用于毛利核算与启动校验，不参与实际扣费。
  upstreamCost: {
    /** 输入成本（元 / 百万令牌）。 */
    inputPerMillion: 2,
    /** 输出成本（元 / 百万令牌）。 */
    outputPerMillion: 8,
  },
  // 按上游模型定价，键为实际调用的模型名，未命中时回退 default。
  // 售价必须显著高于 upstreamCost，否则启动期校验会报出亏损项。
  models: {
    default: {
      inputPerMillion: 4,
      outputPerMillion: 16,
      ratio: 1,
    },
  } as Record<string, BillingModelPrice>,
  // 时段倍率：夜间便宜、晚高峰加价，用价格引导错峰以摊薄上游并发压力。
  timeRules: [
    { startHour: 0, endHour: 8, ratio: 0.9, label: '夜间低谷' },
    { startHour: 8, endHour: 18, ratio: 1, label: '日间标准' },
    { startHour: 18, endHour: 24, ratio: 1.15, label: '晚高峰' },
  ] as BillingTimeRule[],
  // 套餐列表：越贵的套餐单价越低，赠送比例逐档提高。
  packages: [
    { packageId: 'starter', name: '体验包', amountFen: 100, tokens: 200000, bonusRate: 0, badge: '', sort: 1 },
    { packageId: 'standard', name: '常用包', amountFen: 300, tokens: 660000, bonusRate: 0.1, badge: '赠 10%', sort: 2 },
    { packageId: 'pro', name: '超值包', amountFen: 500, tokens: 1200000, bonusRate: 0.2, badge: '赠 20%', sort: 3 },
    { packageId: 'ultimate', name: '畅享包', amountFen: 990, tokens: 2500000, bonusRate: 0.263, badge: '赠 26%', sort: 4 },
  ] as BillingPackage[],
}
