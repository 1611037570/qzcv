import { config } from "@/configs";
import XyRequest from "../request/request";
import { readLicenseKey } from "./license";

const request = new XyRequest({
  baseURL: config.api.baseUrl,
});

// 凭证通过请求头传递，与 IP、设备标识无关
const LICENSE_HEADER = "x-license-key";

// 套餐：金额与到账令牌全部由服务端下发，前端只负责展示与提交套餐标识
export interface BillingPackage {
  packageId: string; // 套餐标识，下单时提交
  name: string; // 套餐名称
  amountFen: number; // 售价（分）
  amountYuan: number; // 售价（元），仅用于展示
  tokens: number; // 到账计费令牌总数
  bonusTokens: number; // 其中赠送的计费令牌
  bonusRate: number; // 赠送比例
  badge: string; // 角标文案
}

// 定价快照：解释「一元换多少令牌」以及当前时段倍率
export interface BillingPricing {
  tokensPerYuan: number; // 1 元兑换的基础计费令牌数
  timeRatio: number; // 当前时段倍率
  timeLabel: string; // 当前时段名称
  startHour: number; // 当前时段起始小时（含）
  endHour: number; // 当前时段结束小时（不含）
  inputPerMillion: number; // 标准模型输入售价（元 / 百万令牌）
  outputPerMillion: number; // 标准模型输出售价（元 / 百万令牌）
  modelRatio: number; // 标准模型倍率
  maxChargeTokensPerRequest: number; // 单次请求最多扣除的计费令牌
  targetMarginRate: number; // 目标毛利率
}

// 令牌流水
export interface BillingLedger {
  id: number; // 流水主键
  type: string; // RECHARGE 充值 / CONSUME 消耗 / ADJUST 人工调整
  tokens: number; // 令牌变动，正数入账负数扣减
  balanceAfter: number; // 变动后余额
  orderNo: string; // 关联订单号
  model: string; // 消耗流水的上游模型
  promptTokens: number; // 输入令牌数
  completionTokens: number; // 输出令牌数
  modelRatio: number; // 模型倍率
  timeRatio: number; // 时段倍率
  remark: string; // 流水说明
  createdAt: string | null; // 创建时间
}

// 钱包快照：只包含凭证本身的余额与流水
export interface BillingWallet {
  activated: boolean; // 是否已绑定有效凭证
  invalid: boolean; // 提交的凭证是否校验失败
  licenseKeyPreview: string; // 脱敏后的凭证
  balanceTokens: number; // 当前可用计费令牌
  totalRechargedTokens: number; // 累计充值到账
  totalConsumedTokens: number; // 累计消耗
  lastUsedAt: string | null; // 最近一次消费时间
  recentLedger: BillingLedger[]; // 最近流水
}

// 定价与套餐：纯配置，与余额接口分开请求，余额异常时仍可展示与下单
export interface BillingCatalog {
  pricing: BillingPricing; // 当前定价快照
  packages: BillingPackage[]; // 可购买套餐
}

// 下单结果
export interface BillingOrderResult {
  orderNo: string; // 本地订单号
  packageName: string; // 套餐名称
  amountFen: number; // 应付金额（分）
  tokens: number; // 到账计费令牌
  bonusTokens: number; // 赠送计费令牌
  status: number; // 订单状态
  channel: string; // 支付渠道
  payUrl: string; // 收银台地址或二维码内容
  expireAt: string | null; // 支付截止时间
  topUp: boolean; // 是否续充到已有凭证
}

// 凭证发放结果
export interface BillingLicenseIssue {
  orderNo: string; // 本地订单号
  status: number; // 发放后状态
  key: string | null; // 明文凭证，仅新签发时返回，服务端不保留
  tokens: number; // 本次到账令牌
  balanceTokens: number; // 到账后余额
  repeated: boolean; // 是否为重复提交
  topUp: boolean; // 是否续充到已有凭证
}

// 请求封装把网络异常当作返回值，这里统一转成可读错误，避免上层拿到 Error 对象当数据用
function unwrap<T>(response: T | Error | any): T {
  if (response instanceof Error || response?.isAxiosError) {
    const message = response?.response?.data?.message;
    const text = Array.isArray(message) ? message[0] : message;
    throw new Error(text || "充值服务暂时不可用，请稍后重试");
  }
  return response as T;
}

// 读取定价与套餐：不需要凭证，余额接口异常时也能拿到价格
export const getBillingCatalog = async () => {
  const response = await request.get({ url: "/billing/catalog" });
  return unwrap<BillingCatalog>(response);
};

// 读取钱包余额与最近流水；传 key 时按传入值试读（绑定前校验），否则用本机凭证
export const getBillingWallet = async (key?: string) => {
  const licenseKey = key ?? readLicenseKey();
  const response = await request.get({
    url: "/billing/wallet",
    // 没有凭证时不发请求头，服务端只返回套餐与定价
    headers: licenseKey ? { [LICENSE_HEADER]: licenseKey } : undefined,
  });
  return unwrap<BillingWallet>(response);
};

// 创建充值订单：只提交套餐标识，金额由服务端定价；带凭证时续充到该凭证
export const createBillingOrder = async (packageId: string) => {
  const licenseKey = readLicenseKey();
  const response = await request.post({
    url: "/billing/orders",
    data: { packageId },
    // 有凭证就走续充，支付成功后余额直接累加到当前凭证
    headers: licenseKey ? { [LICENSE_HEADER]: licenseKey } : undefined,
  });
  return unwrap<BillingOrderResult>(response);
};

// 模拟支付：服务端走完整的回调验签与发放流程，凭证只在本次响应返回一次
export const simulateBillingPayment = async (orderNo: string) => {
  const response = await request.post({ url: `/billing/orders/${encodeURIComponent(orderNo)}/simulate-pay` });
  return unwrap<BillingLicenseIssue>(response);
};
