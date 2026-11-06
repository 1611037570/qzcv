// ReAct（思考-执行-观察）编排层类型定义
import type { ChatMessage, ContextCompactionOptions, ToolCall } from "@snowflake/ai";
export type { ChatMessage, ToolCall } from "@snowflake/ai";

export interface AgentIssue {
  code: string; // 稳定原因编码，不使用提示文字作为失败身份。
  message: string; // 给模型或宿主展示的具体说明。
  target?: string; // 操作目标，用于区分不同字段或模块的问题。
}

export interface AgentToolFailure extends AgentIssue {
  category: "arguments" | "not_found" | "rejected" | "execution"; // 参数、工具缺失、业务拒绝或执行异常。
  retryable: boolean; // 是否允许模型根据反馈修正后继续执行。
}

export interface AgentToolErrorResult {
  __tool_error: true; // 明确标记工具错误，不把普通数据误判为失败。
  failure: AgentToolFailure; // 统一的结构化失败信息。
  details?: unknown; // 宿主补充的工具指引或原始业务失败结果。
}

export type AgentFinalCheck =
  | { status: "retry" /* 继续修正任务。 */; issue: AgentIssue /* 尚未满足的完成条件。 */ }
  | { status: "completed" | "waiting" | "blocked" /* 业务确认的结束状态。 */; reason?: AgentIssue /* 等待或阻塞原因。 */ };

export interface AgentRunResult {
  status: "completed" | "incomplete" | "waiting" | "blocked" | "aborted" | "error"; // 本次运行的明确结束状态。
  answer: string; // 已验收的回答或业务层生成的未完成说明，不使用未验收候选冒充结果。
  steps: number; // 本次实际开始的模型推理轮数。
  reason?: AgentIssue; // 停止原因，与回答文字独立。
  toolFailure?: AgentToolFailure; // 工具导致停止时保留的具体失败。
  error?: unknown; // 执行异常原对象，供宿主沿用现有错误处理。
}

// 单个工具定义，遵循 OpenAI function calling 约定
export interface ReactTool {
  // 工具名，模型据此选择要调用的工具
  name: string;
  // 工具用途说明，帮助模型判断何时调用
  description: string;
  // 参数 JSON Schema
  parameters: Record<string, any>;
  // 执行函数，输入输出均可序列化，便于测试
  execute: (args: any) => unknown | Promise<unknown>;
}

// Think 层输出：一次模型推理的结果
export interface ThinkResult {
  // 思考内容（模型 reasoning，可能为空）
  reasoning: string;
  // 模型决定的工具调用列表，为空表示本次已给出最终答案
  toolCalls: ToolCall[];
  // 最终答案文本，仅当无工具调用时有值
  finalAnswer: string;
}

// Observe 层输出：工具执行结果的格式化观察
export interface Observation {
  // 对应的工具调用 id
  toolCallId: string;
  // 序列化后的观察文本，回填为 tool 消息内容
  content: string;
}

// ReAct 运行配置，由通用运行器使用，避免污染单轮请求流程
export interface ReactConfig {
  // 可用工具列表
  tools: ReactTool[];
  // 明确操作任务首轮必须调用的工具；后续轮次仍由模型自行选择。
  initialTool?: string;
  // 按轮次裁剪本轮可用工具；返回 undefined 表示沿用完整工具集。
  resolveTools?: (step: number) => ReactTool[] | undefined;
  // 最大循环步数，默认九十九轮。
  maxSteps?: number;
  // 同一工具、错误类别和目标的失败累计上限，默认三次；工具成功后重置自身计数。
  repeatedFailureLimit?: number;
  // 业务方提供稳定的失败类别与目标，空值时使用通用结果判断。
  getToolFailure?: (toolCall: ToolCall, result: unknown) => AgentToolFailure | null | undefined;
  // 可选的上下文预算与摘要策略，每轮请求前处理待发送历史。
  context?: ContextCompactionOptions;
  // 模型名，存在时透传到请求 options
  model?: string;
  // 思考模式，不传时默认禁用
  thinking?: { type: "enabled" | "disabled" };
  // 思考回调：每一步思考内容
  onThink?: (reasoning: string) => void;
  // 执行回调：每次工具调用
  onAct?: (toolCall: ToolCall) => void;
  // 观察回调：每次工具执行结果，并标注当前 ReAct 轮次
  onObserve?: (observation: Observation, round: number) => void;
  // 工具异常恢复回调：返回值作为统一错误的补充指引；执行异常无恢复值时停止，工具缺失允许重选。
  onToolError?: (info: {
    toolCall: ToolCall;
    error: Error;
    tools: ReactTool[];
  }) => unknown;
  // 最终答案提交前返回明确状态，重试时用稳定原因计数。
  beforeFinal?: (answer: string) => AgentFinalCheck | Promise<AgentFinalCheck>;
  // 完成检查累计修正上限，默认九十九次，仍受总轮次和相同失败上限约束。
  finalRetryLimit?: number;
  // 候选答案未通过完成检查时通知宿主清理本轮临时展示。
  onFinalRetry?: (reason: string) => void;
  // 自动停止时由业务层保留真实修改并生成未完成说明。
  onIncomplete?: (reason: AgentIssue) => string | Promise<string>;
  // 思考、正文和总令牌数的流式增量分别回调，避免调用方解析事件类型
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
  onToken?: (totalTokens: number) => void;
  // 通用事件仅透传工具调用等其他事件
  onEvent?: (type: string, data: any) => void;
  // 运行结束统一通知结果，取消和异常不伪装成成功回答。
  onFinal?: (result: AgentRunResult) => void;
}

