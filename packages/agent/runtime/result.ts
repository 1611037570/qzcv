import { AbortError } from "@snowflake/ai";
import type { AgentRunResult } from "./types";

// 仅限必须得到完整文本的业务入口使用，保留取消与原始异常的处理语义。
export const getCompletedAgentAnswer = (result: AgentRunResult): string => {
  if (result.status === "completed") return result.answer;
  if (result.status === "aborted") throw new AbortError();
  if (result.status === "error" && result.error) throw result.error;
  throw new Error(result.answer || result.reason?.message || "本轮任务尚未完成");
};
