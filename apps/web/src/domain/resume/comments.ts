/** 保存在所属模块或条目编辑信息中的批注正文。 */
export interface ResumeComment {
  id: string; // 持有者内部的批注唯一编号。
  content: string; // 面试提示或修改建议。
  resolved: boolean; // 批注是否已解决。
}

/** 批注持有者的编辑信息，和表单业务字段分离。 */
export interface ResumeCommentUi {
  reviewComments?: ResumeComment[]; // 当前持有者的批注列表，无批注时可以不创建。
}

export interface ResumeCommentOwner {
  ui?: ResumeCommentUi; // 所属模块或条目的编辑信息。
}

export interface ResumeCommentModule extends ResumeCommentOwner {
  list?: ResumeCommentOwner[]; // 列表模块中的条目，各自持有编辑信息。
}

/** 简历模块集合，模块名称由实际表单决定。 */
export type ResumeCommentData = Record<string, ResumeCommentModule>;

export interface ResumeCommentTarget {
  moduleKey: string; // 批注所属模块，不存入批注正文。
  itemIndex: number; // 当前条目下标，负一表示模块本身，不持久化。
}

export interface ResumeCommentEntry extends ResumeCommentTarget {
  key: string; // 当前持有者和批注编号组成的展示标识，复制条目后不会冲突。
  title: string; // 表单声明的模块标题或独立记录标题，仅在展示时派生。
  comment: ResumeComment; // 持有者保存的原始批注引用。
}

/** 使用实际表单声明解析模块或条目的展示标题。 */
export type ResumeCommentTitleResolver = (target: ResumeCommentTarget) => string;

/** 允许更新的批注字段，编号不由编辑卡片覆盖。 */
export type ResumeCommentPatch = Partial<Pick<ResumeComment, "content" | "resolved">>;

const getOwner = (data: ResumeCommentData | undefined, target: ResumeCommentTarget) => {
  const module = data?.[target.moduleKey];
  return target.itemIndex < 0 ? module : module?.list?.[target.itemIndex];
};

const createEntry = (target: ResumeCommentTarget, comment: ResumeComment, resolveTitle: ResumeCommentTitleResolver): ResumeCommentEntry => ({
  moduleKey: target.moduleKey, // 从当前持有者派生模块归属。
  itemIndex: target.itemIndex, // 从当前列表顺序派生下标。
  key: `${target.moduleKey}:${target.itemIndex}:${comment.id}`, // 运行时展示标识。
  title: resolveTitle(target), // 标题来自当前表单，不使用原文片段冒充。
  comment, // 保留原始引用，不复制正文或拼装读写代理。
});

// 汇总只派生展示上下文，不在数据中重复保存模块名称和记录下标。
export const collectResumeComments = (data: ResumeCommentData | undefined, resolveTitle: ResumeCommentTitleResolver): ResumeCommentEntry[] =>
  Object.entries(data ?? {}).flatMap(([moduleKey, module]) => {
    const collect = (owner: ResumeCommentOwner, itemIndex: number) =>
      (owner.ui?.reviewComments ?? []).map((comment) => createEntry({
        moduleKey, // 当前模块标识。
        itemIndex, // 当前持有者的位置。
      }, comment, resolveTitle));
    return [
      ...collect(module, -1),
      ...(module.list?.flatMap((record, index) => collect(record, index)) ?? []),
    ];
  });

// 创建时只写统一定义的正文结构，批注随持有者保存、复制和删除。
export const addResumeComment = (data: ResumeCommentData | undefined, target: ResumeCommentTarget, content: string, resolveTitle: ResumeCommentTitleResolver): ResumeCommentEntry | null => {
  // 新增只依赖持有者和正文，不以引用文字决定批注是否有效。
  const owner = getOwner(data, target);
  if (!owner || !content.trim()) return null;
  const comment: ResumeComment = {
    id: crypto.randomUUID(), // 新批注编号。
    content: content.trim(), // 去除首尾空白的批注正文。
    resolved: false, // 新批注默认待处理。
  };
  owner.ui ??= {};
  owner.ui.reviewComments ??= [];
  owner.ui.reviewComments.push(comment);
  return createEntry(target, comment, resolveTitle);
};

// 使用方提交可编辑字段，领域入口负责写回所属持有者。
export const updateResumeComment = (data: ResumeCommentData | undefined, entry: ResumeCommentEntry, patch: ResumeCommentPatch) => {
  const comment = getOwner(data, entry)?.ui?.reviewComments?.find((item) => item.id === entry.comment.id);
  if (!comment) return;
  if (patch.content !== undefined) comment.content = patch.content;
  if (patch.resolved !== undefined) comment.resolved = patch.resolved;
};

export const removeResumeComment = (data: ResumeCommentData | undefined, entry: ResumeCommentEntry) => {
  const comments = getOwner(data, entry)?.ui?.reviewComments;
  const index = comments?.findIndex((comment) => comment.id === entry.comment.id) ?? -1;
  if (index >= 0) comments!.splice(index, 1);
};
