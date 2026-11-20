// 引导式 AI 流程配置：仅保留一键入口，其余能力由智能体在聊天中按需触发
import { useResumeStore } from "@/stores";
import type { Flow, SuggestCard } from "./types";
import { collectResumeAdjustmentIssues, useProgress } from "../editor/hooks/useProgress";

// 把完成度检查结果整理为本轮调整范围，供 AI 逐项核对而不是泛化优化。
const getResumeAdjustmentIssues = (): string[] => {
  const resumeStore = useResumeStore();
  const result = useProgress(
    resumeStore.runtimeFields || [],
    resumeStore.currentData || {},
    resumeStore.currentUI || {},
  );
  const issues = collectResumeAdjustmentIssues(result);
  return issues.length ? issues : ["当前检查结果已无待调整问题，请重新核对后结束本轮操作"];
};

export const flows: Record<string, Flow> = {
  // 一键调整：直接补齐检查问题，生成内容在执行后统一标记为待确认。
  oneKeyAdjust: {
    userContent: "帮我一键调整简历问题", // 引导阶段展示的用户意图。
    steps: [], // 点击后直接执行，不再追加授权或补充信息问答。
    build: () => { // 根据点击时的最新检查结果构造真实请求。
      const issues = getResumeAdjustmentIssues();
      return {
        // 用户消息只携带本次检查事实，执行规则由按钮任务配置提供。
        userContent: `请执行一键调整。\n\n当前检查问题：\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
        requestContext: {
          resumeScope: "all", // 完成度检查覆盖整份简历，本轮固定读取全部模块。
          requireResumeIssueClosure: true, // 一键调整还必须关闭完成度检查中的剩余问题。
        },
      };
    },
  },
};

// 建议操作卡片：仅保留一键入口，其余能力由用户在聊天中直接描述触发
export const suggestions: SuggestCard[] = [
  {
    icon: "ph:list-checks-duotone",
    title: "一键调整",
    flow: "oneKeyAdjust",
    category: "resume",
  },
  {
    icon: "ph:rocket-launch-duotone",
    title: "一键优化",
    flow: "oneKeyOptimize",
    category: "resume",
  },
];
