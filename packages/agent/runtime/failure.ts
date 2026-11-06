import { ToolNotFoundError, isAbortError } from "@snowflake/ai";
import type { AgentToolErrorResult, AgentToolFailure } from "./types";

// 统一错误信封，保留宿主指引与原始业务信息供模型修正。
export const toolErrorResult = (failure: AgentToolFailure, details?: unknown): AgentToolErrorResult => ({
  __tool_error: true, // 与普通业务数据区分。
  failure, // 稳定失败契约。
  ...(details === undefined ? {} : { details /* 额外修正指引。 */ }),
});

export const isToolErrorResult = (value: unknown): value is AgentToolErrorResult => {
  if (!value || typeof value !== "object") return false;
  const result = value as AgentToolErrorResult;
  return result.__tool_error === true && typeof result.failure?.code === "string";
};

// 参数错误与执行错误共用同一分类，取消异常必须继续交给取消路径处理。
export const toolExceptionFailure = (error: unknown, retryable = false): AgentToolFailure => {
  if (isAbortError(error)) throw error;
  const missing = error instanceof ToolNotFoundError;
  return {
    category: missing ? "not_found" : "execution", // 区分工具选择错误与执行异常。
    code: missing ? "tool_not_found" : "tool_execution_error", // 不随异常说明变化的错误编码。
    message: error instanceof Error ? error.message : "工具执行失败", // 保留具体失败说明。
    retryable: missing || retryable, // 工具不存在允许重选；执行异常默认停止。
  };
};

// 只识别明确失败信封；具体业务错误编码优先，文案不参与重复失败计数。
export const getDefaultToolFailure = (raw: unknown): AgentToolFailure | undefined => {
  if (isToolErrorResult(raw)) return raw.failure;
  if (!raw || typeof raw !== "object") return;
  const value = raw as Record<string, unknown>;
  if (!(value.accepted === false || value.success === false || value.applied === false ||
    value.status === "failed" || typeof value.error === "string")) return;
  return {
    category: "rejected", // 业务结果明确拒绝本次操作。
    code: typeof value.code === "string" ? value.code : "tool_rejected", // 未声明业务编码时按统一拒绝类别计数。
    target: typeof value.target === "string" ? value.target : undefined, // 仅使用显式业务目标，不从文字猜测。
    message: String(value.error || value.message || value.summary || "工具未能完成操作"), // 回传可读修正原因。
    retryable: true, // 允许模型修正参数后继续。
  };
};
