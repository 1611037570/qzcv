import { createAgent, type ReactConfig } from "@snowflake/agent";
import { getResumeAiModel } from "../request/client";
import { getResumeAiMessage } from "../request/messages";
import { ASSISTANT_WRITING_RULES_TEXT, DRAFT_REQUEST_RULE, OPTIONAL_FIELD_RULE } from "../writingRules";
import { createReadResumeDataTool } from "../tools/tool_read_resume_data";
import { createSkillReferenceTool } from "../tools/skillLoader";
import { resumeSkillRegistry } from "../skills/registry";
import type { ResumeToolContext } from "../tools/tool_types";

// Chat 的宿主接口只允许读取，不能传入写入执行器。
export type ResumeChatContext = Pick<ResumeToolContext, "getResumeData" | "getResumeModuleKeys">;

export type CreateResumeChatSessionOptions = {
  dataContext: ResumeChatContext; // 本轮冻结范围与脱敏后的简历读取接口。
  reactConfig: Omit<ReactConfig, "tools" | "initialTool" | "resolveTools" | "beforeFinal">; // 聊天展示、中止与上下文压缩配置。
  assertActive?: () => void; // 异步读取前核对会话是否仍然有效。
};

// Chat 独立运行，不建立任务契约，不装配写入工具或修改完成校验。
export const createResumeChatSession = (options: CreateResumeChatSessionOptions) => {
  options.assertActive?.();
  const model = getResumeAiModel("xiaoZhou");
  if (!model?.apiKey || !model.url || !model.model) throw new Error(getResumeAiMessage("modelUnset"));
  return createAgent({
    model, // 与 Agent 共用简历助手模型绑定。
    tools: [
      createReadResumeDataTool(options.dataContext),
      createSkillReferenceTool(resumeSkillRegistry, options.dataContext.getResumeModuleKeys, "chat"),
    ], // 只读工具只在本入口装配，不接收宿主提供的工具集合。
    instructions: `${ASSISTANT_WRITING_RULES_TEXT}\n${OPTIONAL_FIELD_RULE}\n${DRAFT_REQUEST_RULE}`, // 共用基础写作规范，具体方法与行业资料按需读取。
    assertActive: options.assertActive, // 停止或切换后不再读取旧会话资料。
    reactConfig: options.reactConfig, // 只保留读取循环与回答回调。
  });
};
