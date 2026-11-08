import { AbortError } from "@/apis";
import { resumeContextCompaction } from "@/apis/llm/contextCompaction";
import type { Message } from "@/stores/modules/ai";
import type { AgentRunResult, ReactConfig } from "@snowflake/agent";
import { createResumeChatSession, type ResumeChatContext } from "@snowflake/resume-agent";

type CreateChatResponseOptions = {
  dataContext: ResumeChatContext; // 当前请求的简历只读适配器。
  message: Message; // 本轮正在展示的回复。
  isCurrent: () => boolean; // 判断请求是否仍属于当前会话。
  thinking: boolean; // 用户选择的思考设置。
  state: {
    onReasoning: (delta?: string) => void; // 更新分析内容与计时。
    onContent: () => void; // 更新生成状态与计时。
    onToken: (tokens: number) => void; // 累计模型用量。
  }; // 与 Agent 共用的请求展示状态。
  onToolError?: ReactConfig["onToolError"]; // 资料读取错误的恢复提示。
  onFinal: (result: AgentRunResult) => void; // 两类回复共用的结束状态处理。
  scrollToBottom: () => void | Promise<void>; // 跟随当前输出滚动。
};

// Chat 仅维护只读回答的流式展示，任务、写入和撤回留在 Agent 分支。
export const createChatResponse = (options: CreateChatResponseOptions) => {
  const { message, state, isCurrent, scrollToBottom } = options;
  return createResumeChatSession({
    dataContext: options.dataContext, // 工具由领域入口自行装配。
    assertActive: () => {
      if (!isCurrent()) throw new AbortError();
    }, // 停止或切换后不能继续读取资料。
    reactConfig: {
      context: resumeContextCompaction, // 共用长对话压缩。
      thinking: { type: options.thinking ? "enabled" : "disabled" }, // 沿用用户设置。
      onToolError: options.onToolError, // 共用读取错误处理。
      onReasoning: state.onReasoning, // 展示真实分析增量。
      onToken: state.onToken, // 累计每轮用量。
      onContent: (delta) => {
        if (!isCurrent()) return;
        state.onContent();
        message.content += delta;
        scrollToBottom();
      }, // 文案直接展示，不经过修改验收。
      onAct: (call) => {
        if (!isCurrent()) return;
        // 丢弃工具轮的过渡正文，避免与最终回答重复拼接。
        message.content = "";
        message.stepLabel = call.function.name === "read_resume_data"
          ? "正在读取所选简历内容…"
          : "正在查阅编写规范与参考资料…";
      }, // 只展示资料读取状态。
      onFinal: options.onFinal, // 完成与异常状态由公共生命周期收口。
    },
  });
};
