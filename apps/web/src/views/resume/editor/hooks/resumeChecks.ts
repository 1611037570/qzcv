/** 检查问题的编辑位置，仅在当前运行时使用，不写入简历。 */
export interface ResumeCheckTarget {
  moduleKey: string; // 问题所属模块编号
  listPath?: (string | number)[]; // 记录所在数组的数据路径
  record?: object; // 检查时的记录引用，定位时重新解析当前下标
}

/** 完成度、格式和时间线检查共用的问题结构。 */
export interface ResumeCheckIssue {
  ruleId: string; // 稳定检查规则编号
  kind: "missing" | "format" | "timeline"; // 缺失、格式或时间线问题分类
  label: string; // 字段或问题类别的显示名称
  message: string; // 当前语言下的问题说明
  severity: "error" | "warning"; // 问题提示等级，不决定是否允许导出
  target: ResumeCheckTarget; // 模块或记录定位信息
}

// 详情与助手共用问题文案，缺失提示自身已包含字段名称。
export const formatResumeCheckIssue = (issue: ResumeCheckIssue): string =>
  issue.kind === "missing" ? issue.message : `${issue.label}：${issue.message}`;
