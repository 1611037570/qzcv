import { LLM } from "./request/core";
import { readLicenseKey } from "@/apis/billing/license";
import { useAiStore } from "@/stores";
import type { AiAgentKey } from "@/stores/modules/ai";

// 根据业务角色获取对应的模型实例
const getAgentLLM = (agent: AiAgentKey) => {
  const aiStore = useAiStore();
  const modelId = aiStore.getAgentModelId(agent);
  const config = aiStore.modelList.find((model) => model.id === modelId);

  if (!config) {
    return;
  }

  // 内置服务的余额归属于访问凭证：有凭证就随请求带上，没有则由服务端按免费额度处理
  const licenseKey = config.builtin ? readLicenseKey() : "";

  return new LLM({
    usageAgent: agent, // 仅真实业务调用进入个人使用统计，模型连接检测不计入。
    url: config.url,
    apiKey: config.key,
    provider: config.provider,
    model: config.model,
    protocol: config.protocol === "responses" ? "responses" : "chatCompletions",
    headers: licenseKey ? { "x-license-key": licenseKey } : undefined, // 仅内置服务携带凭证。
  });
};

// 简历助手小舟负责简历业务。
const getXiaoZhouLLM = () => getAgentLLM("xiaoZhou");

// 面试官小羊独立绑定面试模型。
const getXiaoYangLLM = () => getAgentLLM("xiaoYang");

// 简历解析模型供后续解析流程调用
const getResumeParseLLM = () => getAgentLLM("resumeParser");

export { getResumeParseLLM, getXiaoYangLLM, getXiaoZhouLLM, LLM };
// 错误类型统一出口：供调用方区分主动中止与真实请求失败
export { ApiError, AbortError, ToolNotFoundError, isAbortError } from "./errors";
