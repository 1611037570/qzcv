import type { ResumeAgentTaskProfile } from "../runtime/taskTypes";
import { getOptimizationScoreIssue } from "../reports/optimizationReview";

// 入口只声明目标和必要事实边界，写作方法与候选规则由通用技能负责。
export const ONE_KEY_OPTIMIZE_TASK: ResumeAgentTaskProfile = {
  id: "oneKeyOptimize", // 独立优化入口。
  preferredCapabilityId: "resume_optimization", // 优先采用通用优化方法，其他技能由 Agent 按需选择。
  allowModuleTitleEdit: false, // 本入口处理简历内容，不修改展示标题。
  allowRequestInput: false, // 一次完成草稿，不进入聊天追问。
  objective: "根据目标岗位与用户要求，尽可能完善简历草稿，突出个人贡献与岗位价值", // 由 Agent 判断改写重点和执行顺序。
  requiredEffects: [], // 优质内容允许保留，不为达到改动数量而强行写入。
  successCondition: "完成简历内容优化、核对最终草稿，并交付含六维评分的报告；无需修改时仍评估现有简历并说明原因", // 评分属于交付内容，不能省略后直接宣布完成。
  completionPolicy: {
    requiredEvidence: ["read"], // 内容判断必须先读取真实简历。
    readAfterEvidence: ["resume_change"], // 最终判断仍须基于修改后的数据。
  },
  validateFinal: (answer, evidence) => {
    // 写入失败先修复；写入通过后一次检查整份评分，不重做已完成内容。
    const writes = evidence.filter((item) => item.kind === "resume_change" && !item.replayed);
    const lastWrite = writes[writes.length - 1];
    if (lastWrite && lastWrite.status !== "success") return {
      code: "unresolved", // 最新写入仍有失败项，不能标为全部完成。
      text: "最近一次修改尚未成功，请根据工具结果修正并重新提交，再读取最终草稿复核。", // 仅修复实际操作问题。
    };
    const scoreIssue = getOptimizationScoreIssue(answer);
    return scoreIssue ? { code: "report_invalid", text: scoreIssue } : null;
  },
  instructions: `# 目标
根据目标岗位、可选 JD 和优化重点，交出可以直接预览的完整简历草稿。先理解经历的价值，再决定结构、取舍和表达，不把优化局限于换几个词。按需要选择写作、岗位匹配、评估或参考知识，不必为走流程而加载无关内容。

# 内容边界
- 资料不完整不代表无法优化，处理已有内容，不要求所有模块齐全。综合优化可重组、合并重复表达、突出贡献与交付、调整记录顺序，并在现有模块内补充有依据的内容。
- 保留已经确认的身份、公司、学校、时间与具体成果，不虚构已获得的成绩。稀疏内容按共用写作规则起草与已有线索相容的职责、方法和成果候选，未知细节用 XX，并在 todo 中指出需要核实的内容；候选不计作已确认的成果。
- 精简模式只压缩已有内容；岗位匹配模式突出已有证据，不把 JD 要求复制成用户具备的能力。不删除唯一的真实工作、项目、教育记录或身份与联系方式，弱相关内容可精简和后置。
- 需要实际修改时调用写入工具，不以建议代替行动。工具指出失败项时只修复未完成部分，按实际需要批量或分步处理；最终核对事实、重复和遗漏，避免反复重写已经合适的内容。

# 最终说明
完成后返回简洁 JSON，包含 summary（本次结论）、changes（按模块说明具体问题、处理和改善）、todo（待补充或核实的事实）与 suggestions（剩余行动）。changes 每项可写 module、summary、problem、benefit；实际改动清单和前后摘录由程序根据真实数据生成，无需重复抄写。
评分是本次交付的必需内容，必须在同一次最终回复中提供 dimensions（六维评分数组），不得省略。六项名称固定为信息完整度、阅读效率、职业契合度、职业成就、发展潜力、职业稳定性，每项包含 name（维度名称）与 score（零至一百分的整数）。基于最终草稿的完整程度、清晰度、重复与证据情况评价；信息完整度和阅读效率必须给出分数，信息不足应体现在较低分数和待补充事项中。其余维度确实缺少判断基础时 score 为 null，并在 suggestions（后续建议）说明原因，不能用零分代替不适用。总分由程序根据有效维度计算，不是录用概率。无实际修改时仍对当前简历评分。评分与优化说明必须在同一份 JSON 中一次完成，不为评分额外调用工具或重做修改。`, // 最终报告同时交付真实修改和有依据的评分。
};
