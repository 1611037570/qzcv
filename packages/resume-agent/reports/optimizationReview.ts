import { richTextToPlainText } from "@snowflake/resume-core";
import type { ResumeAgentTaskEvidence } from "../runtime/taskTypes";
import { RESUME_SCORE_DIMENSIONS, type ReportChange, type ResumeReport } from "./resumeReport";

type DataView = Record<string, {
  title?: string; // 实际读取到的模块名称。
  data?: unknown; // 去除界面状态与媒体后的业务内容。
}>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const plain = (value: unknown): string => {
  if (typeof value === "string") return richTextToPlainText(value).trim();
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join("；");
  if (isObject(value)) return Object.values(value).map(plain).filter(Boolean).join("；");
  return typeof value === "number" ? String(value) : "";
};

// 报告只是说明，不让代码围栏、维度顺序或缺少字段使已完成的内容优化失败。
const readReport = (content: string): Record<string, unknown> => {
  const candidates = [content.trim(), ...Array.from(content.matchAll(/```(?:json|resume-report)?\s*\n([\s\S]*?)\n```/g), (match) => match[1]!)];
  for (const candidate of candidates) {
    try { const value = JSON.parse(candidate); if (isObject(value)) return value; }
    catch { /* 格式不可用时由实际草稿变化整理报告，不追加模型返工。 */ }
  }
  return {};
};

// 找到实际变化的字段，原文与改后摘录由程序生成，不要求模型逐字抄写。
const findChange = (before: unknown, after: unknown): [string, string] | null => {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  if ((isObject(before) || Array.isArray(before)) && (isObject(after) || Array.isArray(after))) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const change = findChange((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key]);
      if (change) return change;
    }
  }
  return [plain(before), plain(after)];
};

const excerpts = ([before, after]: [string, string]): [string, string] => {
  let prefix = 0;
  while (prefix < Math.min(before.length, after.length) && before[prefix] === after[prefix]) prefix += 1;
  const start = Math.max(0, prefix - 48);
  return [before.slice(start, start + 180), after.slice(start, start + 180)];
};

// 输出与验收共用分数归一规则，不能一侧接受而另一侧把有效分数丢掉。
const normalizeScore = (value: unknown): number | null => {
  const score = typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null;
};

// 一次返回全部评分缺口，避免逐个维度触发模型重试。
export const getOptimizationScoreIssue = (content: string): string | null => {
  const value = readReport(content);
  if (!Array.isArray(value.dimensions)) return "最终报告必须包含 dimensions（六维评分数组），请在当前报告中一次补齐评分，不要重新修改简历或重复读取。";
  const issues: string[] = [];
  if (value.dimensions.length !== RESUME_SCORE_DIMENSIONS.length) issues.push("评分数组必须恰好包含六个固定维度");
  for (const name of RESUME_SCORE_DIMENSIONS) {
    const entries = value.dimensions.filter((item) => isObject(item) && item.name === name);
    if (entries.length !== 1) { issues.push(`${name}缺失或重复`); continue; }
    const score = entries[0]!.score;
    const normalizedScore = normalizeScore(score);
    if (normalizedScore == null && score !== null) issues.push(`${name}需提供零至一百分的数值或明确为 null`);
    // 有可优化正文即可以评价信息与表达，不能把所有可判断维度一起省略。
    if (["信息完整度", "阅读效率"].includes(name) && normalizedScore == null) issues.push(`${name}须根据当前草稿给出分数`);
  }
  return issues.length ? `评分尚未完成：${issues.join("；")}。请基于已读取并核对的最终草稿，在同一份 JSON 中一次修正以上全部评分，不重复优化或调用工具。` : null;
};

// 实际改动以最终数据差异为准；模型只补充原因、建议与可用评分，不能伪造改动。
export const buildOptimizationReport = (
  content: string,
  evidence: ResumeAgentTaskEvidence[],
  originalData: unknown,
  finalData: unknown,
  completed: boolean,
): ResumeReport => {
  const before: DataView = isObject(originalData) ? originalData as DataView : {};
  const after: DataView = isObject(finalData) ? finalData as DataView : {};
  const value = readReport(content);
  const proposed = Array.isArray(value.changes) ? value.changes.filter(isObject) : [];
  const verified = evidence.filter((item) => item.changed === true && item.status !== "failed" && !item.replayed)
    .flatMap((item) => item.verifiedChanges ?? []);
  const changes: ReportChange[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const changed = findChange(before[key]?.data, after[key]?.data);
    if (!changed) continue;
    const module = after[key]?.title || before[key]?.title || key;
    const explanation = proposed.find((item) => item.module === module || item.module === key);
    const [oldText, newText] = excerpts(changed);
    changes.push({
      module, // 真实发生最终变化的模块。
      summary: text(explanation?.summary) || [...new Set(verified.filter((item) => item.module === module).map((item) => item.summary))].join("；") || "已调整该模块内容", // 优先使用对应模块的说明。
      problem: text(explanation?.problem) || undefined, // 可用的模型问题分析。
      benefit: text(explanation?.benefit) || undefined, // 可用的模型改善说明。
      before: oldText, // 程序提取的原文片段。
      after: newText, // 程序提取的最终草稿片段。
    });
  }
  const dimensions = RESUME_SCORE_DIMENSIONS.map((name) => {
    const dimension = Array.isArray(value.dimensions) ? value.dimensions.find((item) => isObject(item) && item.name === name) : undefined;
    const score = isObject(dimension) ? normalizeScore(dimension.score) : null;
    return {
      name, // 展示维度按前端约定排列，模型无需保持顺序。
      score: completed ? score : null, // 未完成报告不冒充完整评分。
    };
  });
  const scores = dimensions.flatMap((item) => item.score == null ? [] : [item.score]);
  const todo = strings(value.todo);
  // 候选内容沿用共用写作规则，但必须提醒用户核实，不能冒充已确认事实。
  if (/(?:^|[^A-Z])XX(?=[^A-Z]|$)/.test(plain(after))) {
    todo.unshift("草稿包含 XX 待补充内容，保存前请逐项替换并核实相关职责、方法和成果。");
  }
  return {
    summary: !completed ? `已保留 ${changes.length} 个模块的部分修改，尚未完成整份简历优化。` : text(value.summary) || (changes.length ? `已整理 ${changes.length} 个模块的实际修改，请查看优化前后效果。` : "已检查当前简历，本轮没有产生内容修改。"), // 部分结果使用真实状态，不沿用模型的完成宣称。
    totalScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null, // 只按有效维度计算。
    dimensions, // 缺少评分时仍能展示实际改动。
    changes, // 真实原文与最终草稿产生的改动。
    checks: Array.isArray(value.checks) ? value.checks.filter(isObject).filter((item) => text(item.message)).map((item) => ({
      level: item.level === "error" ? "error" : "warning", // 未识别的级别按提醒展示。
      message: text(item.message), // 模型指出的剩余问题。
    })) : [],
    todo: [...new Set(todo)], // 去重后的待核实内容。
    highlights: changes.length ? strings(value.highlights) : [], // 没有实际改动时不宣称优化亮点。
    suggestions: strings(value.suggestions), // 剩余行动建议。
  };
};
