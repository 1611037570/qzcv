import { config } from "@/configs";
import XyRequest from "../request/request";

const request = new XyRequest({
  baseURL: config.api.baseUrl,
});

// 上游健康等级：ready 表示配置完整但还没有请求，unknown 表示状态读取失败
export type LlmServiceHealth = "ready" | "healthy" | "degraded" | "down" | "unknown";
// 上游额度等级：unknown 表示上游未开放额度查询
export type LlmQuotaLevel = "enough" | "low" | "empty" | "unknown";

// 上游服务状态：只返回结论，模型名与额度属于内部信息，不对外暴露
export interface LlmServiceStatus {
  level: LlmServiceHealth; // 服务状态结论
}

// 读取上游服务状态，失败时由调用方降级为「状态未知」
export const getLlmServiceStatus = async () => {
  const response = await request.get({ url: "/llm/service-status" });
  if (response instanceof Error || response?.isAxiosError) throw response;
  return response as LlmServiceStatus;
};
