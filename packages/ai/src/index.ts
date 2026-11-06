// 统一导出模型请求、消息和错误能力，供宿主按需组合。
export { ApiError, AbortError, ToolNotFoundError, isAbortError } from "./errors.js";
export { LLM } from "./core.js";
export type { LLMRequestConfig } from "./core.js";
export { prepareContext } from "./context.js";
export type { ContextCompactionOptions } from "./context.js";
export type { LlmObserver } from "./observer.js";
export type { ChatMessage, ToolCall } from "./messages.js";
