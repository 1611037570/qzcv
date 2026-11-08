import type { ResumeAssistantMode } from "@snowflake/resume-agent";

export type AiChatSummary = {
  // 历史列表展示会话创建时确定的类型。
  mode: ResumeAssistantMode;
  id: string;
  title: string;
  createTime: number;
  updateTime: number;
};

export type ResumeListItem = {
  id: string;
  ai: AiChatSummary[];
  deletedAt: number | null;
};

export const createResumeListItem = (id: string): ResumeListItem => ({
  id,
  ai: [],
  deletedAt: null,
});

export const upsertAiChatSummary = (
  item: ResumeListItem,
  summary: AiChatSummary,
): ResumeListItem => ({
  ...item,
  ai: [summary, ...item.ai.filter((chat) => chat.id !== summary.id)],
});

export const removeAiChatSummaries = (item: ResumeListItem): ResumeListItem => ({
  ...item,
  ai: [],
});

export const setResumeDeletedAt = (
  item: ResumeListItem,
  deletedAt: number | null,
): ResumeListItem => ({ ...item, deletedAt });

export const removeResumeListItem = (list: ResumeListItem[], id: string) =>
  list.filter((item) => item.id !== id);
