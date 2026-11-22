import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { DataSource } from 'typeorm'
import { BILLING_TOKENS_PER_YUAN, billingConfig } from '../../configs/billing.config'
import { BillingPricingService, type BillingPricingSnapshot } from './billing-pricing.service'
import { MockPaymentProvider } from './payment/mock-payment.provider'
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment/payment.types'

// 订单状态：0 待支付 1 已支付 2 已发放凭证 3 已关闭
export const BILLING_ORDER_STATUS = {
  PENDING: 0,
  PAID: 1,
  ISSUED: 2,
  CLOSED: 3,
} as const

// 凭证状态：1 可用 2 已用完（余额为 0，仍可查询） 3 已作废
export const LICENSE_STATUS = {
  ACTIVE: 1,
  EMPTY: 2,
  VOID: 3,
} as const

// 凭证字符集：去掉 I、O、0、1 避免抄写混淆；32 个字符能被 256 整除，取模无偏
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// 套餐展示结构
export type BillingPackageView = {
  /** 套餐标识，下单时提交给服务端。 */
  packageId: string
  /** 套餐名称。 */
  name: string
  /** 售价（分）。 */
  amountFen: number
  /** 售价（元），仅用于展示。 */
  amountYuan: number
  /** 到账计费令牌总数。 */
  tokens: number
  /** 其中赠送的计费令牌。 */
  bonusTokens: number
  /** 相对基础单价的赠送比例。 */
  bonusRate: number
  /** 角标文案。 */
  badge: string
}

// 令牌流水结构
export type BillingLedgerView = {
  /** 流水主键。 */
  id: number
  /** 流水类型：RECHARGE 充值 / CONSUME 消耗 / ADJUST 人工调整。 */
  type: string
  /** 令牌变动，正数入账负数扣减。 */
  tokens: number
  /** 变动后余额。 */
  balanceAfter: number
  /** 关联订单号。 */
  orderNo: string
  /** 消耗流水的上游模型。 */
  model: string
  /** 消耗流水的输入令牌数。 */
  promptTokens: number
  /** 消耗流水的输出令牌数。 */
  completionTokens: number
  /** 本次消耗命中的模型倍率。 */
  modelRatio: number
  /** 本次消耗命中的时段倍率。 */
  timeRatio: number
  /** 流水说明。 */
  remark: string
  /** 创建时间。 */
  createdAt: Date | null
}

// 钱包快照：只包含凭证本身的余额与流水，定价与套餐由 catalog 单独提供
export type BillingWalletView = {
  /** 是否已绑定有效凭证。 */
  activated: boolean
  /** 提交的凭证是否校验失败，用于前端区分「没填」与「填错了」。 */
  invalid: boolean
  /** 脱敏后的凭证，未激活时为空。 */
  licenseKeyPreview: string
  /** 当前可用计费令牌。 */
  balanceTokens: number
  /** 累计充值到账令牌。 */
  totalRechargedTokens: number
  /** 累计消耗令牌。 */
  totalConsumedTokens: number
  /** 最近一次消费时间。 */
  lastUsedAt: Date | null
  /** 最近流水。 */
  recentLedger: BillingLedgerView[]
}

// 定价与套餐：纯配置，不依赖数据库，余额接口异常时仍能展示与下单
export type BillingCatalogView = {
  /** 当前定价快照。 */
  pricing: BillingPricingSnapshot
  /** 可购买的套餐。 */
  packages: BillingPackageView[]
}

// 凭证发放结果：明文只在首次签发的凭证上返回一次
export type BillingLicenseIssue = {
  /** 本地订单号。 */
  orderNo: string
  /** 发放后的订单状态。 */
  status: number
  /** 明文凭证，仅新签发时返回；续充或重复请求为 null。 */
  key: string | null
  /** 本次到账令牌。 */
  tokens: number
  /** 发放后余额。 */
  balanceTokens: number
  /** 是否为重复提交。 */
  repeated: boolean
  /** 是否续充到已有凭证。 */
  topUp: boolean
}

// 凭证行，内部校验与扣费使用
type LicenseRow = {
  /** 主键。 */
  id: number
  /** 凭证公开部分。 */
  key_id: string
  /** 密文哈希。 */
  secret_hash: string
  /** 哈希盐值。 */
  salt: string
  /** 凭证状态。 */
  status: number
  /** 可用余额。 */
  balance_tokens: string
  /** 累计充值。 */
  total_recharged_tokens: string
  /** 累计消耗。 */
  total_consumed_tokens: string
  /** 最近消费时间。 */
  last_used_at: Date | null
}

// 建表语句与 billing.sql 内容保持一致：启动时幂等执行，缺少手工建表也能直接跑通
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS \`billing_license\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`key_id\` VARCHAR(16) NOT NULL COMMENT '凭证公开部分，用于查库定位',
    \`secret_hash\` CHAR(64) NOT NULL COMMENT '密文的 SHA-256 哈希，服务端不存明文',
    \`salt\` VARCHAR(16) NOT NULL COMMENT '哈希盐值',
    \`status\` TINYINT NOT NULL DEFAULT 1 COMMENT '凭证状态：1 可用 2 已用完 3 已作废',
    \`balance_tokens\` BIGINT NOT NULL DEFAULT 0 COMMENT '当前可用计费令牌余额',
    \`total_recharged_tokens\` BIGINT NOT NULL DEFAULT 0 COMMENT '累计充值到账令牌',
    \`total_consumed_tokens\` BIGINT NOT NULL DEFAULT 0 COMMENT '累计消耗计费令牌',
    \`order_no\` VARCHAR(40) NOT NULL DEFAULT '' COMMENT '发放该凭证的订单号，一单只发一张',
    \`risk_flags\` JSON NULL COMMENT '风控标记，记录异常消费特征',
    \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    \`last_used_at\` DATETIME NULL COMMENT '最近一次消费时间',
    \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uk_key_id\` (\`key_id\`),
    UNIQUE KEY \`uk_order_no\` (\`order_no\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='访问凭证与余额'`,
  `CREATE TABLE IF NOT EXISTS \`billing_recharge_order\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`order_no\` VARCHAR(40) NOT NULL COMMENT '本地订单号，对外唯一',
    \`package_id\` VARCHAR(32) NOT NULL COMMENT '套餐标识，对应服务端套餐配置',
    \`package_name\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '套餐名称快照',
    \`amount_fen\` INT UNSIGNED NOT NULL COMMENT '应付金额（分），服务端定价，不信任前端',
    \`tokens\` BIGINT NOT NULL DEFAULT 0 COMMENT '到账计费令牌总数',
    \`bonus_tokens\` BIGINT NOT NULL DEFAULT 0 COMMENT '其中赠送的计费令牌',
    \`status\` TINYINT NOT NULL DEFAULT 0 COMMENT '订单状态：0 待支付 1 已支付 2 已发放 3 已关闭',
    \`channel\` VARCHAR(16) NOT NULL DEFAULT 'mock' COMMENT '支付渠道标识',
    \`provider_txn_id\` VARCHAR(64) NULL COMMENT '支付平台交易号，唯一索引防止重复回调重复发放',
    \`pay_url\` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '收银台地址或二维码内容',
    \`license_key_id\` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '发放后绑定的凭证公开部分',
    \`target_key_id\` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '下单时指定的续充凭证，为空表示发新凭证',
    \`ip_hash\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '下单来源 IP 哈希，仅用于短时归属校验与限流',
    \`paid_at\` DATETIME NULL COMMENT '支付完成时间',
    \`issued_at\` DATETIME NULL COMMENT '凭证发放时间',
    \`expire_at\` DATETIME NULL COMMENT '订单支付截止时间',
    \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uk_order_no\` (\`order_no\`),
    UNIQUE KEY \`uk_provider_txn\` (\`provider_txn_id\`),
    KEY \`idx_ip_created\` (\`ip_hash\`, \`created_at\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='充值订单'`,
  `CREATE TABLE IF NOT EXISTS \`billing_license_ledger\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`key_id\` VARCHAR(16) NOT NULL COMMENT '归属凭证的公开部分',
    \`type\` VARCHAR(16) NOT NULL COMMENT '流水类型：RECHARGE 充值 / CONSUME 消耗 / ADJUST 人工调整',
    \`tokens\` BIGINT NOT NULL COMMENT '变动令牌数，正数入账负数扣减',
    \`balance_after\` BIGINT NOT NULL DEFAULT 0 COMMENT '变动后的余额快照',
    \`order_no\` VARCHAR(40) NOT NULL DEFAULT '' COMMENT '关联订单号，消耗流水为空',
    \`model\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '消耗流水的实际上游模型',
    \`prompt_tokens\` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消耗流水的输入令牌数',
    \`completion_tokens\` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消耗流水的输出令牌数',
    \`upstream_cost_micro\` BIGINT NOT NULL DEFAULT 0 COMMENT '本次消耗的上游成本（微元），仅用于毛利核算',
    \`model_ratio\` DECIMAL(8,3) NOT NULL DEFAULT 1.000 COMMENT '计费时命中的模型倍率',
    \`time_ratio\` DECIMAL(8,3) NOT NULL DEFAULT 1.000 COMMENT '计费时命中的时段倍率',
    \`remark\` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '流水说明',
    \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (\`id\`),
    KEY \`idx_key_id\` (\`key_id\`, \`id\`),
    KEY \`idx_order_no\` (\`order_no\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='凭证令牌流水'`,
]

@Injectable()
export class BillingService implements OnModuleInit {
  // 建表结果：失败时不阻断服务启动，接口层会返回明确原因
  private schemaReady = false
  private schemaError = ''

  constructor(
    // 简历库不可用时数据源为空，充值接口统一返回不可用
    @Optional()
    @InjectDataSource('resume')
    private readonly dataSource: DataSource | null,
    private readonly pricing: BillingPricingService,
    // 业务只依赖支付接口，替换渠道不需要改动下单与发放逻辑
    @Inject(PAYMENT_PROVIDER)
    private readonly payment: PaymentProvider,
    // 模拟渠道额外提供签名能力，仅用于本地「模拟支付」按钮
    @Optional()
    private readonly mockPayment: MockPaymentProvider,
  ) {}

  async onModuleInit() {
    const dataSource = this.dataSource
    if (!dataSource) {
      console.warn('充值计费未启用：数据库连接不可用，余额与下单接口将返回不可用')
      return
    }

    // 生产环境沿用默认哈希密钥等于没有保护，启动时明确提示一次
    if (process.env.NODE_ENV === 'production' && billingConfig.license.pepper === 'snowflake-license-pepper') {
      console.warn('凭证哈希密钥仍是默认值，请在 .env.production 中设置 BILLING_LICENSE_PEPPER')
    }

    try {
      for (const statement of SCHEMA_STATEMENTS) {
        await dataSource.query(statement)
      }
      this.schemaReady = true
    } catch (error) {
      this.schemaError = error instanceof Error ? error.message : String(error)
      console.error('充值计费建表失败，请手工执行 modules/billing/billing.sql', this.schemaError)
    }
  }

  /**
   * 读取定价与套餐。
   * 只读内存配置，不查库也不需要凭证：数据库异常时用户依然能看到价格与套餐。
   */
  getCatalog(): BillingCatalogView {
    return {
      pricing: this.pricing.snapshot(),
      packages: this.packageViews(),
    }
  }

  /**
   * 读取钱包。
   * 余额只归属于凭证：没提交凭证就什么都不返回，提交了无效凭证明确标记，
   * 不再用 IP 与设备标识推导账户，也就不会出现升级浏览器或换网络丢余额。
   */
  async getWallet(rawKey?: string): Promise<BillingWalletView> {
    const dataSource = this.requireDataSource()

    // 没填凭证与填错凭证要区分开，前者提示充值，后者提示核对
    if (!rawKey) {
      return {
        activated: false,
        invalid: false,
        licenseKeyPreview: '',
        balanceTokens: 0,
        totalRechargedTokens: 0,
        totalConsumedTokens: 0,
        lastUsedAt: null,
        recentLedger: [],
      }
    }

    const license = await this.verifyLicense(rawKey)
    if (!license) {
      return {
        activated: false,
        invalid: true,
        licenseKeyPreview: '',
        balanceTokens: 0,
        totalRechargedTokens: 0,
        totalConsumedTokens: 0,
        lastUsedAt: null,
        recentLedger: [],
      }
    }

    const ledger = await dataSource.query(
      `SELECT id, type, tokens, balance_after, order_no, model, prompt_tokens, completion_tokens,
              model_ratio, time_ratio, remark, created_at
       FROM billing_license_ledger WHERE key_id = ? ORDER BY id DESC LIMIT 8`,
      [license.key_id],
    )

    return {
      activated: true,
      invalid: false,
      licenseKeyPreview: this.maskKey(license.key_id),
      balanceTokens: Number(license.balance_tokens ?? 0),
      totalRechargedTokens: Number(license.total_recharged_tokens ?? 0),
      totalConsumedTokens: Number(license.total_consumed_tokens ?? 0),
      lastUsedAt: license.last_used_at ?? null,
      recentLedger: (ledger as Record<string, any>[]).map((row) => this.toLedgerView(row)),
    }
  }

  /** 读取指定凭证的流水，limit 由服务端夹紧。 */
  async listLedger(rawKey: string, limit = 20) {
    const dataSource = this.requireDataSource()
    const license = await this.verifyLicense(rawKey)
    if (!license) throw new BadRequestException('凭证无效')

    const size = Math.min(Math.max(Math.floor(limit) || 20, 1), 100)
    const rows = await dataSource.query(
      `SELECT id, type, tokens, balance_after, order_no, model, prompt_tokens, completion_tokens,
              model_ratio, time_ratio, remark, created_at
       FROM billing_license_ledger WHERE key_id = ? ORDER BY id DESC LIMIT ?`,
      [license.key_id, size],
    )
    return (rows as Record<string, any>[]).map((row) => this.toLedgerView(row))
  }

  /**
   * 校验凭证。
   * 按公开部分查库，再用「盐 + 服务端密钥」复算哈希做常数时间比较；
   * 不存在与密文错误对外表现一致，不泄漏哪一步失败。
   */
  async verifyLicense(rawKey?: string): Promise<LicenseRow | null> {
    const dataSource = this.dataSource
    if (!dataSource || !this.schemaReady) return null

    const parsed = this.parseKey(rawKey)
    if (!parsed) return null

    const rows = await dataSource.query(
      `SELECT id, key_id, secret_hash, salt, status, balance_tokens, total_recharged_tokens,
              total_consumed_tokens, last_used_at
       FROM billing_license WHERE key_id = ? LIMIT 1`,
      [parsed.keyId],
    )
    const license = (rows as LicenseRow[])[0]
    if (!license) return null

    const expected = this.hashSecret(parsed.secret, license.salt)
    if (!this.safeEqual(expected, license.secret_hash)) return null

    // 已用完的凭证仍允许查看余额，已作废的直接拒绝
    if (Number(license.status) === LICENSE_STATUS.VOID) return null
    return license
  }

  /**
   * 创建订单。
   * 金额与到账令牌全部取自服务端套餐配置，前端只能提交套餐标识；
   * 传入有效凭证时表示续充到该凭证，否则支付成功后签发一张新凭证。
   */
  async createOrder(ipHash: string, packageId: string, licenseKey?: string) {
    const dataSource = this.requireDataSource()
    const pkg = billingConfig.packages.find((item) => item.packageId === packageId)
    if (!pkg) throw new BadRequestException('套餐不存在，请刷新页面后重试')

    // 凭证无效时按「发新凭证」处理，不让一张过期的本机凭证卡住购买
    const target = licenseKey ? await this.verifyLicense(licenseKey) : null

    // 惰性关闭该来源已过期的待支付订单，避免状态长期停留在待支付
    await dataSource.query(
      'UPDATE billing_recharge_order SET status = ? WHERE ip_hash = ? AND status = ? AND expire_at < NOW()',
      [BILLING_ORDER_STATUS.CLOSED, ipHash, BILLING_ORDER_STATUS.PENDING],
    )

    // 滚动 24 小时窗口：不依赖数据库时区；已关闭的过期单不占额度
    const recentRows = await dataSource.query(
      `SELECT COUNT(*) AS total FROM billing_recharge_order
       WHERE ip_hash = ? AND status <> ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [ipHash, BILLING_ORDER_STATUS.CLOSED],
    )
    const recentCount = Number((recentRows as Record<string, any>[])[0]?.total ?? 0)
    if (recentCount >= billingConfig.dailyOrderLimit) {
      throw new BadRequestException(`24 小时内下单次数已达上限（${billingConfig.dailyOrderLimit} 次），请稍后再试`)
    }

    const orderNo = this.createOrderNo()
    const expireAt = new Date(Date.now() + billingConfig.orderExpireMinutes * 60 * 1000)
    // 到账令牌按套餐配置固定，赠送部分单独记录便于展示与对账
    const bonusTokens = pkg.tokens - Math.round((pkg.amountFen / 100) * BILLING_TOKENS_PER_YUAN)
    const intent = await this.payment.create({
      orderNo,
      amountFen: pkg.amountFen,
      subject: pkg.name,
      expireAt,
    })

    await dataSource.query(
      `INSERT INTO billing_recharge_order
        (order_no, package_id, package_name, amount_fen, tokens, bonus_tokens, status, channel, pay_url,
         target_key_id, ip_hash, expire_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNo,
        pkg.packageId,
        pkg.name,
        pkg.amountFen,
        pkg.tokens,
        Math.max(bonusTokens, 0),
        BILLING_ORDER_STATUS.PENDING,
        intent.channel,
        intent.payUrl,
        target?.key_id ?? '',
        ipHash,
        expireAt,
      ],
    )

    return {
      orderNo,
      packageName: pkg.name,
      amountFen: pkg.amountFen,
      tokens: pkg.tokens,
      bonusTokens: Math.max(bonusTokens, 0),
      status: BILLING_ORDER_STATUS.PENDING,
      channel: intent.channel,
      payUrl: intent.payUrl,
      expireAt,
      // 续充不会产生新凭证，前端据此决定支付后展示新凭证还是直接刷新余额
      topUp: Boolean(target),
    }
  }

  /** 查询订单：用下单来源 IP 做短时归属校验，避免订单号被他人读取或代为支付。 */
  async getOrder(orderNo: string, ipHash: string) {
    const dataSource = this.requireDataSource()
    const rows = await dataSource.query(
      `SELECT order_no, package_name, amount_fen, tokens, bonus_tokens, status, channel, pay_url,
              created_at, paid_at, issued_at, expire_at
       FROM billing_recharge_order WHERE order_no = ? AND ip_hash = ? LIMIT 1`,
      [orderNo, ipHash],
    )
    const row = (rows as Record<string, any>[])[0]
    if (!row) throw new NotFoundException('订单不存在')
    return {
      orderNo: row.order_no,
      packageName: row.package_name ?? '',
      amountFen: Number(row.amount_fen ?? 0),
      tokens: Number(row.tokens ?? 0),
      bonusTokens: Number(row.bonus_tokens ?? 0),
      status: Number(row.status ?? 0),
      channel: row.channel ?? '',
      payUrl: row.pay_url ?? '',
      createdAt: row.created_at ?? null,
      paidAt: row.paid_at ?? null,
      issuedAt: row.issued_at ?? null,
      expireAt: row.expire_at ?? null,
    }
  }

  /**
   * 模拟支付。
   * 只用于未接入真实渠道时的联调：按渠道签名规则生成回调，再走与线上完全一致的验签与发放链路。
   */
  async simulatePayment(orderNo: string, ipHash: string): Promise<BillingLicenseIssue> {
    if (!billingConfig.mockPayment || !this.mockPayment) {
      throw new ForbiddenException('模拟支付已关闭，请通过正式支付渠道完成付款')
    }

    const order = await this.getOrder(orderNo, ipHash)
    if (order.status >= BILLING_ORDER_STATUS.ISSUED) {
      // 凭证只在发放时展示一次，重复提交不再返回明文
      const license = await this.findLicenseByOrder(orderNo)
      return {
        orderNo,
        status: order.status,
        key: null,
        tokens: 0,
        balanceTokens: Number(license?.balance_tokens ?? 0),
        repeated: true,
        topUp: false,
      }
    }
    if (order.status === BILLING_ORDER_STATUS.CLOSED) throw new BadRequestException('订单已关闭')
    if (order.expireAt && order.expireAt.getTime() < Date.now()) {
      await this.closeOrder(orderNo)
      throw new BadRequestException('订单已过期，请重新下单')
    }

    const callback = this.mockPayment.buildCallback({ orderNo, amountFen: order.amountFen })
    return this.handleCallback(this.payment.channel, callback.rawBody, callback.headers)
  }

  /**
   * 支付回调入口。
   * 只做验签、金额核对与幂等发放，不在这里做任何慢操作，保证渠道重试时能快速返回。
   */
  async handleCallback(
    channel: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<BillingLicenseIssue> {
    const dataSource = this.requireDataSource()
    if (channel !== this.payment.channel) throw new BadRequestException('未知的支付渠道')

    const payload = this.payment.parseCallback(rawBody, headers)
    if (!payload) throw new BadRequestException('回调验签失败')

    const rows = await dataSource.query(
      `SELECT order_no, package_name, amount_fen, tokens, target_key_id, status
       FROM billing_recharge_order WHERE order_no = ? LIMIT 1`,
      [payload.orderNo],
    )
    const order = (rows as Record<string, any>[])[0]
    if (!order) throw new NotFoundException('订单不存在')

    // 金额必须与本地订单完全一致，避免渠道金额与定价不一致造成资损
    if (Number(order.amount_fen) !== payload.amountFen) {
      console.error('支付回调金额不一致', payload.orderNo, order.amount_fen, payload.amountFen)
      throw new BadRequestException('回调金额与订单不一致')
    }

    return this.issueLicense(order, payload.providerTxnId)
  }

  /**
   * 发放凭证。
   * 订单状态流转、凭证创建、余额入账、流水记录放在同一事务里，
   * 影响行数不是 1 就回滚，保证「一单只发一张凭证」。
   */
  private async issueLicense(order: Record<string, any>, providerTxnId: string): Promise<BillingLicenseIssue> {
    const dataSource = this.requireDataSource()

    return dataSource.transaction(async (manager) => {
      // 唯一索引 provider_txn_id 兜底：同一笔渠道交易只能绑定一个订单
      const paidResult = await manager.query(
        `UPDATE billing_recharge_order SET status = ?, provider_txn_id = ?, paid_at = NOW()
         WHERE order_no = ? AND status = ?`,
        [BILLING_ORDER_STATUS.PAID, providerTxnId, order.order_no, BILLING_ORDER_STATUS.PENDING],
      )
      if (this.affectedRows(paidResult) !== 1) {
        // 重复回调属于正常重试：不重复发凭证，也不返回明文
        const current = await manager.query(
          'SELECT status FROM billing_recharge_order WHERE order_no = ? LIMIT 1 FOR UPDATE',
          [order.order_no],
        )
        const row = (current as Record<string, any>[])[0]
        const license = await this.findLicenseByOrder(order.order_no, manager)
        return {
          orderNo: order.order_no,
          status: Number(row?.status ?? BILLING_ORDER_STATUS.PAID),
          key: null,
          tokens: 0,
          balanceTokens: Number(license?.balance_tokens ?? 0),
          repeated: true,
          topUp: false,
        }
      }

      const tokens = Number(order.tokens ?? 0)
      const targetKeyId = String(order.target_key_id ?? '')

      // 续充到已有凭证：余额累加，不签发新凭证，也就没有明文可返回
      if (targetKeyId) {
        const topped = await manager.query(
          `UPDATE billing_license
           SET balance_tokens = balance_tokens + ?, total_recharged_tokens = total_recharged_tokens + ?, status = ?
           WHERE key_id = ?`,
          [tokens, tokens, LICENSE_STATUS.ACTIVE, targetKeyId],
        )
        if (this.affectedRows(topped) === 1) {
          const balanceRows = await manager.query(
            'SELECT balance_tokens FROM billing_license WHERE key_id = ? LIMIT 1',
            [targetKeyId],
          )
          const balanceTokens = Number((balanceRows as Record<string, any>[])[0]?.balance_tokens ?? 0)

          await manager.query(
            `INSERT INTO billing_license_ledger (key_id, type, tokens, balance_after, order_no, remark)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [targetKeyId, 'RECHARGE', tokens, balanceTokens, order.order_no, '续充到账'],
          )

          const toppedOrder = await manager.query(
            `UPDATE billing_recharge_order SET status = ?, issued_at = NOW(), license_key_id = ?
             WHERE order_no = ? AND status = ?`,
            [BILLING_ORDER_STATUS.ISSUED, targetKeyId, order.order_no, BILLING_ORDER_STATUS.PAID],
          )
          if (this.affectedRows(toppedOrder) !== 1) {
            throw new Error(`订单 ${order.order_no} 状态流转异常，已回滚本次发放`)
          }

          return {
            orderNo: order.order_no,
            status: BILLING_ORDER_STATUS.ISSUED,
            key: null,
            tokens,
            balanceTokens,
            repeated: false,
            topUp: true,
          }
        }

        // 目标凭证已不存在（被作废或清理）：降级为签发新凭证，避免已支付的订单发不出货
        console.warn(`续充目标凭证 ${targetKeyId} 不存在，订单 ${order.order_no} 改为签发新凭证`)
      }

      const built = this.buildKey()

      // 明文只在本次返回值里出现一次，库里只有哈希
      await manager.query(
        `INSERT INTO billing_license
          (key_id, secret_hash, salt, status, balance_tokens, total_recharged_tokens, order_no)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [built.keyId, built.hash, built.salt, LICENSE_STATUS.ACTIVE, tokens, tokens, order.order_no],
      )

      const issuedResult = await manager.query(
        `UPDATE billing_recharge_order SET status = ?, issued_at = NOW(), license_key_id = ?
         WHERE order_no = ? AND status = ?`,
        [BILLING_ORDER_STATUS.ISSUED, built.keyId, order.order_no, BILLING_ORDER_STATUS.PAID],
      )
      // 影响行数必须为 1，否则说明状态被并发改写，需要回滚
      if (this.affectedRows(issuedResult) !== 1) {
        throw new Error(`订单 ${order.order_no} 状态流转异常，已回滚本次发放`)
      }

      await manager.query(
        `INSERT INTO billing_license_ledger (key_id, type, tokens, balance_after, order_no, remark)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [built.keyId, 'RECHARGE', tokens, tokens, order.order_no, '充值到账'],
      )

      return {
        orderNo: order.order_no,
        status: BILLING_ORDER_STATUS.ISSUED,
        key: built.plainKey,
        tokens,
        balanceTokens: tokens,
        repeated: false,
        topUp: false,
      }
    })
  }

  /**
   * 结算一次对话消耗。
   * 凭证缺失或无效时不扣费，继续走免费额度，不阻断对话；
   * 结算失败只记录日志，不影响已经完成的响应。
   */
  async settle(
    rawKey: string | undefined,
    input: {
      /** 实际调用的上游模型。 */
      model: string
      /** 输入令牌数。 */
      promptTokens: number
      /** 输出令牌数。 */
      completionTokens: number
    },
  ) {
    const dataSource = this.dataSource
    if (!dataSource || !this.schemaReady || !rawKey) return { chargedTokens: 0, balanceTokens: 0 }

    const parsed = this.parseKey(rawKey)
    if (!parsed) return { chargedTokens: 0, balanceTokens: 0 }

    const quote = this.pricing.quote({
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
    })
    if (quote.billedTokens <= 0) return { chargedTokens: 0, balanceTokens: 0 }

    try {
      return await dataSource.transaction(async (manager) => {
        // 行锁保证同一凭证的并发流式请求不会同时读到同一个余额
        const rows = await manager.query(
          'SELECT id, key_id, secret_hash, salt, status, balance_tokens FROM billing_license WHERE key_id = ? FOR UPDATE',
          [parsed.keyId],
        )
        const license = (rows as LicenseRow[])[0]
        if (!license) return { chargedTokens: 0, balanceTokens: 0 }

        // 与查询接口同一套校验：密文错误、已作废的凭证一律不扣
        if (!this.safeEqual(this.hashSecret(parsed.secret, license.salt), license.secret_hash)) {
          return { chargedTokens: 0, balanceTokens: 0 }
        }
        if (Number(license.status) === LICENSE_STATUS.VOID) return { chargedTokens: 0, balanceTokens: 0 }

        const balance = Number(license.balance_tokens ?? 0)
        if (balance <= 0) return { chargedTokens: 0, balanceTokens: 0 }

        // 余额不足时扣到零为止，本次请求不追扣，避免出现负余额
        const charged = Math.min(quote.billedTokens, balance)
        const balanceAfter = balance - charged
        await manager.query(
          `UPDATE billing_license
           SET balance_tokens = ?, total_consumed_tokens = total_consumed_tokens + ?,
               status = ?, last_used_at = NOW()
           WHERE id = ?`,
          [balanceAfter, charged, balanceAfter <= 0 ? LICENSE_STATUS.EMPTY : LICENSE_STATUS.ACTIVE, license.id],
        )
        await manager.query(
          `INSERT INTO billing_license_ledger
            (key_id, type, tokens, balance_after, model, prompt_tokens, completion_tokens,
             upstream_cost_micro, model_ratio, time_ratio, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            license.key_id,
            'CONSUME',
            -charged,
            balanceAfter,
            input.model,
            input.promptTokens,
            input.completionTokens,
            quote.upstreamCostMicro,
            quote.modelRatio,
            quote.timeRatio,
            `${quote.timeLabel}计费${quote.clamped ? '（已按单次上限截断）' : ''}`,
          ],
        )
        return { chargedTokens: charged, balanceTokens: balanceAfter }
      })
    } catch (error) {
      // 对话已经完成，记账失败只上报，不影响用户已拿到的内容
      const message = error instanceof Error ? error.message : String(error)
      console.error('令牌扣减失败', parsed.keyId, message)
      return { chargedTokens: 0, balanceTokens: 0 }
    }
  }

  // 套餐视图：把代码配置转换成前端直接可用的结构
  private packageViews(): BillingPackageView[] {
    return [...billingConfig.packages]
      .sort((left, right) => left.sort - right.sort)
      .map((item) => ({
        packageId: item.packageId,
        name: item.name,
        amountFen: item.amountFen,
        amountYuan: item.amountFen / 100,
        tokens: item.tokens,
        bonusTokens: Math.max(item.tokens - Math.round((item.amountFen / 100) * BILLING_TOKENS_PER_YUAN), 0),
        bonusRate: item.bonusRate,
        badge: item.badge,
      }))
  }

  /**
   * 生成一张新凭证。
   * 公开部分用于查库，密文只返回给用户一次；库里只留「盐 + 服务端密钥 + 密文」的哈希。
   */
  private buildKey() {
    const { prefix, keyIdLength, secretLength } = billingConfig.license
    const keyId = this.randomCode(keyIdLength)
    const secret = this.randomCode(secretLength)
    const salt = randomBytes(8).toString('hex')
    return {
      keyId,
      salt,
      hash: this.hashSecret(secret, salt),
      plainKey: `${prefix}-${keyId}-${secret}`,
    }
  }

  /** 宽松解析用户输入：忽略大小写与分隔符，长度和字符集不符直接判为无效。 */
  private parseKey(rawKey?: string) {
    if (!rawKey) return null
    const { prefix, keyIdLength, secretLength } = billingConfig.license
    const normalized = rawKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!normalized.startsWith(prefix)) return null

    const body = normalized.slice(prefix.length)
    if (body.length !== keyIdLength + secretLength) return null
    // 任意位置出现字符集之外的字符都不去查库，减少无效查询
    if (![...body].every((char) => KEY_ALPHABET.includes(char))) return null

    return { keyId: body.slice(0, keyIdLength), secret: body.slice(keyIdLength) }
  }

  // 脱敏展示：只露出前缀与公开部分首尾各两位，密文完全不出现
  private maskKey(keyId: string) {
    const { prefix } = billingConfig.license
    return `${prefix}-${keyId.slice(0, 2)}••••${keyId.slice(-2)}`
  }

  // 哈希只在服务端计算，盐值随机，同一密文在不同凭证下的哈希完全不同
  private hashSecret(secret: string, salt: string) {
    return createHash('sha256')
      .update(`${billingConfig.license.pepper}:${salt}:${secret}`)
      .digest('hex')
  }

  // 常数时间比较，避免通过响应时间推断密文
  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    if (leftBuffer.length !== rightBuffer.length) return false
    return timingSafeEqual(leftBuffer, rightBuffer)
  }

  // 字符集长度为 32 且整除 256，取模不会引入分布偏差
  private randomCode(length: number) {
    const bytes = randomBytes(length)
    let code = ''
    for (let index = 0; index < length; index++) {
      code += KEY_ALPHABET[bytes[index] % KEY_ALPHABET.length]
    }
    return code
  }

  // 订单号 = 时间戳 + 随机后缀：随机部分取 8 字节，避免被枚举后冒领未支付订单
  private createOrderNo() {
    return `SF${Date.now().toString(36).toUpperCase()}${randomBytes(8).toString('hex').toUpperCase()}`
  }

  // 按订单号反查凭证，用于重复支付时返回当前余额
  private async findLicenseByOrder(
    orderNo: string,
    manager?: { query: (sql: string, params?: any[]) => Promise<any> },
  ) {
    const executor: { query: (sql: string, params?: any[]) => Promise<any> } = manager ?? this.requireDataSource()
    const rows = (await executor.query(
      'SELECT key_id, balance_tokens FROM billing_license WHERE order_no = ? LIMIT 1',
      [orderNo],
    )) as LicenseRow[]
    return rows[0]
  }

  // 将待支付订单置为已关闭，条件更新保证不会覆盖已支付或已发放的订单
  private async closeOrder(orderNo: string) {
    const dataSource = this.requireDataSource()
    await dataSource.query(
      'UPDATE billing_recharge_order SET status = ? WHERE order_no = ? AND status = ?',
      [BILLING_ORDER_STATUS.CLOSED, orderNo, BILLING_ORDER_STATUS.PENDING],
    )
  }

  // mysql2 的写操作返回 ResultSetHeader，个别版本会包一层数组，这里统一取影响行数
  private affectedRows(result: unknown): number {
    const header = Array.isArray(result) ? result[0] : result
    return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0)
  }

  private requireDataSource(): DataSource {
    if (!this.dataSource) throw new ServiceUnavailableException('充值功能未启用：数据库连接不可用')
    if (!this.schemaReady) {
      throw new ServiceUnavailableException(`充值功能未就绪：${this.schemaError || '数据表尚未创建'}`)
    }
    return this.dataSource
  }

  private toLedgerView(row: Record<string, any>): BillingLedgerView {
    return {
      id: Number(row.id ?? 0),
      type: row.type ?? '',
      tokens: Number(row.tokens ?? 0),
      balanceAfter: Number(row.balance_after ?? 0),
      orderNo: row.order_no ?? '',
      model: row.model ?? '',
      promptTokens: Number(row.prompt_tokens ?? 0),
      completionTokens: Number(row.completion_tokens ?? 0),
      modelRatio: Number(row.model_ratio ?? 1),
      timeRatio: Number(row.time_ratio ?? 1),
      remark: row.remark ?? '',
      createdAt: row.created_at ?? null,
    }
  }
}
