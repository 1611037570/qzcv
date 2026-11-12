// 旧路径转导出同一组错误类型，保持现有调用方引用不变。
import { ApiError, AbortError, ToolNotFoundError, isAbortError } from "@snowflake/ai";
export { ApiError, AbortError, ToolNotFoundError, isAbortError };

// 传输层会在原因前拼上 "502 [code]: " 之类的技术前缀，展示时去掉
const PREFIX_PATTERN = /^\d{3}(?:\s*\[[^\]]*\])?:\s*/;
// 含中文说明服务端已经给出可读结论
const READABLE_PATTERN = /[\u4e00-\u9fa5]/;

/**
 * 把请求失败转换成可以直接展示的文案。
 * 服务端已下发中文结论时原样使用，其余按状态码归类；原始错误仍由请求层打印到控制台。
 */
export function toFriendlyError(error: unknown): Error {
  // 主动中止不是错误，交给调用方区分
  if (isAbortError(error)) return error as Error;

  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const reason = raw.replace(PREFIX_PATTERN, "");

  // 服务端返回的结论可以直接展示
  if (READABLE_PATTERN.test(reason)) return new ApiError(reason, status);

  if (status === 429) return new ApiError("请求过于频繁，请稍后再试", status);
  if (status === 401 || status === 403) return new ApiError("AI 服务鉴权失败，请检查模型配置", status);
  if (status === 404) return new ApiError("AI 服务接口地址不正确，请检查模型配置", status);
  if (status === 504) return new ApiError("AI 服务响应超时，请稍后重试", status);
  if (typeof status === "number" && status >= 500) return new ApiError("AI 服务暂时不可用，请稍后重试", status);
  return new ApiError("网络连接失败，请检查网络后重试", status);
}
