import type { AgentFinalCheck, AgentIssue, ReactTool } from "@snowflake/agent";
import { loadSkillResource } from "../types";
import { DRAFT_REQUEST_RULE, OPTIONAL_FIELD_RULE } from "../writingRules";
import type {
  ResumeAgentCompletionPolicy,
  ResumeAgentRequiredEffect,
  ResumeAgentTool,
  ResumeAgentToolEffect,
  ResumeAgentToolRuntimeMeta,
} from "./types";
import {
  evaluateResumeAgentCompletion,
  resolveResumeAgentCompletionPolicy,
  EVIDENCE_NAMES,
  type ResolvedResumeAgentCompletionPolicy,
} from "./completionPolicy";
import { hasFreshSuccessfulEvidence } from "./taskEvidence";
import { createResumeAgentToolExecution } from "./toolExecution";
import {
  cloneResumeAgentTask,
  TASK_RELATIONS,
  TASK_REQUIRED_EFFECTS,
  type CreateResumeAgentTaskRuntimeOptions,
  type ResumeAgentIncompleteReason,
  type ResumeAgentTaskEvidence,
  type ResumeAgentTaskRelation,
  type ResumeAgentTaskRequirement,
  type ResumeAgentTaskState,
} from "./taskTypes";

// 工具效果对应的必需业务效果，用于规划缺失时建立隐式任务
const TOOL_EFFECT_TARGETS: Record<ResumeAgentToolEffect, ResumeAgentRequiredEffect | undefined> = {
  read: undefined,
  mutation: "resume_change",
  submit: "draft_submit",
  sync: "language_update",
};

// 模型未声明完成条件时按任务效果生成可核对的默认条件
const resolveDefaultSuccessCondition = (effects: ResumeAgentRequiredEffect[]) => {
  if (effects.includes("resume_change")) return "当前简历已按用户要求完成写入";
  if (effects.includes("draft_submit")) return "已提交符合用户要求的结构化草稿";
  if (effects.includes("language_update")) return "简历展示语言已同步";
  return "已向用户给出所需结果";
};

// 校验并归一化规划参数中的需求清单；未提供时返回空清单。
// 用户一条消息包含多个诉求时必须逐条拆出，收口阶段按清单逐条核对，防止部分诉求被静默遗漏。
const normalizeTaskRequirements = (
  raw: unknown,
): { error?: string; requirements?: ResumeAgentTaskRequirement[] } => {
  if (raw === undefined) return { requirements: [] };
  if (!Array.isArray(raw)) return { error: "requirements 必须是数组；只有单一诉求时可省略该字段" };
  for (const item of raw) {
    const entry = item as Record<string, unknown> | null;
    if (!entry || typeof entry.objective !== "string" || !entry.objective.trim()) {
      return { error: "requirements 每一项都必须提供非空的 objective" };
    }
    if (entry.requiredEffects === undefined) continue;
    if (!Array.isArray(entry.requiredEffects)) {
      return { error: "requirements 的 requiredEffects 必须是数组" };
    }
    const unknownEffect = entry.requiredEffects.find(
      (effect) => !TASK_REQUIRED_EFFECTS.includes(effect as ResumeAgentRequiredEffect),
    );
    if (unknownEffect !== undefined) {
      return { error: `未知的必需效果 ${String(unknownEffect)}，可选值：${TASK_REQUIRED_EFFECTS.join("、")}` };
    }
  }
  return {
    requirements: (raw as Record<string, unknown>[]).map((entry, index) => ({
      // 稳定标识供确认工具与失败计数引用。
      id: `requirement-${index + 1}`,
      objective: (entry.objective as string).trim(),
      // 该条诉求要求真实产生的业务效果；空数组表示文字回复即可。
      requiredEffects: ((entry.requiredEffects as ResumeAgentRequiredEffect[] | undefined) ?? []).filter(
        (effect) => TASK_REQUIRED_EFFECTS.includes(effect),
      ),
      // 清单条目从待处理开始，由确认工具推进。
      status: "pending",
    })),
  };
};

// 统计目标描述中的编号罗列（如 1）…2）、①②…）。
// 编号必须紧跟编号符才算命中，金额、日期等数字不会误伤；
// 同时出现 1 和 2 起始的编号才认定为罗列，避免「第 1 条」这类单一引用误判。
const countObjectiveEnumeration = (objective: string) => {
  const circled = new Set(objective.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g) ?? []);
  const arabic = new Set<string>();
  const pattern = /(?:^|[^0-9a-zA-Z])([1-9]|1[0-9])(?=[）)．.、])/g;
  for (const match of objective.matchAll(pattern)) arabic.add(match[1]!);
  return circled.size >= 2 || (arabic.has("1") && arabic.has("2"))
    ? Math.max(circled.size, arabic.size)
    : 0;
};

// 同一个 Agent 只负责规划与行动，任务阶段和完成结果由运行时依据工具事实维护。
export const createResumeAgentTaskRuntime = (options: CreateResumeAgentTaskRuntimeOptions) => {
  let task: ResumeAgentTaskState | undefined;
  // 规划缺失时的任务仍可由正式规划接管，已有工具证据必须保留。
  let implicitTask = false;
  // 最后一次被完成校验拒绝的结构化原因，用于收口时生成用户可读结果。
  let incompleteReason: ResumeAgentIncompleteReason | undefined;
  // 本轮注册工具的执行元数据，创建与包装两个时点都会登记，验收策略据此翻译成验收要求。
  const toolMetaByName = new Map<string, ResumeAgentToolRuntimeMeta>();
  const registerToolMetas = (tools: ReactTool[]) => {
    tools.forEach((tool) => {
      const meta = (tool as ResumeAgentTool).taskMeta;
      if (meta) toolMetaByName.set(tool.name, meta);
    });
  };
  const getToolMetas = () => [...toolMetaByName.values()];
  registerToolMetas(options.tools ?? []);
  const toolExecution = createResumeAgentToolExecution(() => task, options.onEvidence);
  const previousTask = cloneResumeAgentTask(options.previousTask);
  const capabilityMap = new Map((options.capabilities ?? []).map((skill) => [skill.id, skill]));
  const capabilityIds = [...capabilityMap.keys()];
  // 能力目录只列标识与名称，选择依据由目标与工具契约给出。
  const capabilityCatalog = [...capabilityMap.values()]
    .map((skill) => `${skill.id}：${skill.name}`)
    .join("\n");
  const capabilityDescription = capabilityCatalog
    ? `只选择直接帮助完成本轮目标的任务能力；没有合适能力时传空数组。可选能力：\n${capabilityCatalog}`
    : "当前入口没有可选任务能力，传空数组。";
  // 当前入口是否允许把缺失信息抛回给用户：一次性修复入口必须自行补齐。
  const allowRequestInput = options.allowTaskPause !== false &&
    options.taskProfile?.allowRequestInput !== false;
  // 固定入口（按钮与一次性任务）的目标和验收已由入口声明，不引入需求清单机制，
  // 避免模型对单一用途任务误拆清单后白耗确认轮次。
  const allowRequirements = !options.taskProfile &&
    !options.fixedRequiredEffects?.length &&
    !options.fixedSuccessCondition;
  let completionPolicy: ResolvedResumeAgentCompletionPolicy = {
    requiredEffects: [], // 建立任务后写入最终任务效果。
    requiredEvidence: [], // 建立任务后再按必需效果和能力填充。
    readAfterEvidence: [], // 建立任务后再合并写后读取要求。
    requiredFacts: [], // 建立任务后再合并业务事实要求。
    evidenceOrder: [], // 建立任务后再合并工具执行顺序。
    scopeCoverage: null, // 建立任务后再按能力声明读取范围覆盖要求。
  };
  // 验收策略的输入快照：工具可能晚于规划才登记，收口前据此按最新工具约束重算。
  let policyInputs: {
    planned: ResumeAgentRequiredEffect[];
    policies: ResumeAgentCompletionPolicy[];
  } | undefined;

  const planTaskTool: ReactTool = {
    name: "plan_resume_task",
    description:
      "根据用户原始消息、功能入口、近期对话和上一轮任务建立本轮任务契约。判断文字回复是否足以完成请求；若用户需要当前简历、草稿或展示语言真实变化，必须声明对应 requiredEffects。" +
      (allowRequirements ? "用户一条消息包含多个诉求时必须逐条拆入 requirements，不得合并或遗漏；objective 只保留一句概括，不要罗列条目。" : "") +
      "选择 capabilityIds 后会返回对应能力全文。",
    parameters: {
      type: "object",
      properties: {
        relation: {
          type: "string",
          enum: TASK_RELATIONS,
          description: "new 表示可独立完成或需要不同业务效果的请求；continue 表示继续上一任务并继承其业务效果与需求清单；revise 表示修正上一结果并继承其业务效果，需要重做的已确认条目必须重新拆入 requirements。",
        },
        objective: {
          type: "string",
          description: "用户最终希望达成的目标，结合近期对话理解省略表达。",
        },
        scope: {
          type: "string",
          description: "本轮涉及的模块、记录或内容范围；无法确定时如实说明。",
        },
        requiredEffects: {
          type: "array",
          items: {
            type: "string",
            enum: TASK_REQUIRED_EFFECTS,
          },
          uniqueItems: true,
          description: "new 任务必须真实发生的业务效果；只需解释、分析或建议时传空数组。resume_change 表示当前简历必须写入，draft_submit 表示必须提交结构化草稿，language_update 表示必须同步展示语言。continue 或 revise 会继承上一任务效果。",
        },
        successCondition: {
          type: "string",
          description: "一句可核对的完成条件，说明用户最终应得到什么结果，不能只写已回答或已处理。",
        },
        capabilityIds: {
          type: "array",
          items: {
            type: "string",
            ...(capabilityIds.length ? { enum: capabilityIds } : {}),
          },
          uniqueItems: true,
          description: capabilityDescription,
        },
        ...(allowRequirements ? {
          requirements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                objective: {
                  type: "string",
                  description: "单条诉求的目标描述。",
                },
                requiredEffects: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: TASK_REQUIRED_EFFECTS,
                  },
                  uniqueItems: true,
                  description: "该条诉求要求真实产生的业务效果；文字回复即可的条目传空数组。",
                },
              },
              required: ["objective"],
              additionalProperties: false,
            },
            description: "本轮需求清单：用户一条消息包含多个诉求时必须逐条拆出，不得合并或遗漏；执行和收口会按清单逐条核对。只有单一诉求时可省略整个字段。continue 承接上一清单；revise 只承接未完成条目，需要重做的已确认条目重新拆入。",
          },
        } : {}),
      },
      required: options.source === "chat" && previousTask
        ? ["relation", "objective", "requiredEffects"]
        : ["objective", "requiredEffects"],
      additionalProperties: false,
    },
    execute: async (args) => {
      if (task && !implicitTask) {
        // 正式任务只建立一次，避免执行中重新规划后丢失已取得的证据。
        return { accepted: false, error: "本轮任务已经建立，请继续执行当前任务" };
      }
      // 缺少效果数组不能默认为纯回复任务，否则修改诉求会被误判为已完成。
      if (!Array.isArray(args?.requiredEffects)) {
        return { accepted: false, error: "请明确提供 requiredEffects；仅需文字回复时传空数组" };
      }
      // 效果枚举写错会直接改变验收口径，必须让模型改对而不是静默丢弃。
      const rawEffects: unknown[] = args.requiredEffects;
      const unknownEffect = rawEffects.find(
        (effect) => !TASK_REQUIRED_EFFECTS.includes(effect as ResumeAgentRequiredEffect),
      );
      if (unknownEffect !== undefined) {
        return {
          accepted: false,
          error: `未知的必需效果 ${String(unknownEffect)}，可选值：${TASK_REQUIRED_EFFECTS.join("、")}`,
        };
      }
      const effects = rawEffects as ResumeAgentRequiredEffect[];
      // 缺省字段按用户原始需求和效果补齐，避免参数不全导致整轮请求无法建立任务
      const objective =
        typeof args?.objective === "string" && args.objective.trim()
          ? args.objective.trim()
          : options.fallbackObjective?.trim() || "处理用户本轮请求";
      const scope =
        typeof args?.scope === "string" && args.scope.trim() ? args.scope.trim() : "未明确指定";
      // 有上一任务时必须明确新任务、继续或修正，不能把省略表达静默当成新任务。
      if (options.source === "chat" && previousTask && !TASK_RELATIONS.includes(args?.relation)) {
        return { accepted: false, error: "请明确 relation 为 new、continue 或 revise" };
      }
      // 明确功能入口和没有上一任务的对话都从新任务开始，避免误承接历史目标。
      const relation: ResumeAgentTaskRelation =
        options.source === "chat" && previousTask && TASK_RELATIONS.includes(args?.relation)
          ? (args.relation as ResumeAgentTaskRelation)
          : "new";
      // 固定入口不接受清单拆分：任务目标与验收已由入口固定，误拆只会浪费确认轮次。
      if (args?.requirements !== undefined && !allowRequirements) {
        return { accepted: false, error: "当前入口的任务目标与验收已固定，不拆需求清单，请省略 requirements" };
      }
      // 需求清单校验：多诉求必须逐条拆出；未提供时按关系承接上一任务清单。
      const normalizedRequirements = normalizeTaskRequirements(args?.requirements);
      if (normalizedRequirements.error) {
        return { accepted: false, error: normalizedRequirements.error };
      }
      const requirements =
        args?.requirements !== undefined
          ? normalizedRequirements.requirements ?? []
          : relation !== "new"
            ? (previousTask?.requirements ?? []).filter(
                // revise 只承接未完成条目：需要重做的已确认条目由规划重新拆入，状态从待处理开始；
                // 继续任务保持原状，已确认结果不重复验收。
                (item) => relation === "continue" || item.status !== "covered",
              )
            : [];
      // 目标里罗列多条诉求会绕过清单核对，必须让模型改拆成 requirements 再建立任务。
      const enumeratedCount = countObjectiveEnumeration(objective);
      if (allowRequirements && enumeratedCount >= 2 && requirements.length < enumeratedCount) {
        return {
          accepted: false,
          error: `objective 只保留一句概括，不要罗列 ${enumeratedCount} 条诉求；请把每条诉求逐项拆入 requirements（当前只有 ${requirements.length} 条）`,
        };
      }
      const requestedCapabilityIds = (Array.isArray(args?.capabilityIds) ? args.capabilityIds : []).filter(
        (id: unknown): id is string => typeof id === "string" && capabilityMap.has(id),
      );
      const continuedCapabilityIds = relation === "new" ? [] : previousTask?.capabilityIds ?? [];
      const selectedCapabilityIds = [
        ...(options.preferredCapabilityId ? [options.preferredCapabilityId] : []),
        ...requestedCapabilityIds,
        ...(requestedCapabilityIds.length ? [] : continuedCapabilityIds),
      ].filter((id, index, list) => capabilityMap.has(id) && list.indexOf(id) === index);
      // 规划阶段只加载真正被选中的能力正文，其余目录项保持轻量。
      const selectedCapabilities = await Promise.all(
        selectedCapabilityIds.map((id) => loadSkillResource(capabilityMap.get(id)!)),
      );
      const plannedEffects = options.taskProfile?.requiredEffects ??
        options.fixedRequiredEffects ??
        (relation !== "new" && previousTask
          ? previousTask.requiredEffects
          : effects);
      const policies = [
        options.taskProfile?.completionPolicy,
        ...selectedCapabilities.map((capability) => capability.completionPolicy),
      ].filter((policy): policy is ResumeAgentCompletionPolicy => Boolean(policy));
      // 正式规划接管隐式任务时保留实际执行过的业务效果和工具证据。
      const effectiveEffects = [...new Set([
        ...plannedEffects,
        ...requirements.flatMap((item) => item.requiredEffects), // 需求条目声明的效果一并纳入总验收。
        ...(implicitTask ? task?.requiredEffects ?? [] : []),
      ])];
      const existingEvidence = implicitTask ? task?.evidence ?? [] : [];
      policyInputs = { planned: effectiveEffects, policies };
      const resolvedPolicy = resolveResumeAgentCompletionPolicy(effectiveEffects, policies, getToolMetas());
      task = {
        id: options.taskId,
        source: options.source,
        relation,
        objective: options.taskProfile?.objective ?? objective,
        scope,
        requiredEffects: resolvedPolicy.requiredEffects,
        successCondition: options.taskProfile?.successCondition ??
          options.fixedSuccessCondition ??
          (typeof args?.successCondition === "string" && args.successCondition.trim()
            ? args.successCondition.trim()
            : resolveDefaultSuccessCondition(resolvedPolicy.requiredEffects)),
        capabilityIds: selectedCapabilityIds,
        requirements: requirements.length ? requirements : undefined,
        phase: "planned",
        evidence: existingEvidence,
      };
      implicitTask = false;
      // 完成条件由任务效果与本轮选中的能力共同决定，不依赖模型自行声明完成。
      completionPolicy = resolvedPolicy;
      // 观测：记录本轮任务契约，便于宿主还原验收口径。
      options.onTrace?.({ type: "planned", task: cloneResumeAgentTask(task)! });
      return {
        accepted: true,
        task,
        ...(requirements.length > 1 ? {
          // 需求清单在结果中原样返回，收口前必须逐条处理并确认。
          requirementNotice: "本轮包含多个需求：执行和最终回答必须逐条覆盖清单中的每个条目，收口前调用 confirm_resume_requirements 逐条确认处理结果。",
        } : {}),
        capabilities: selectedCapabilities.map((capability) => {
          return { id: capability.id, name: capability.name, instructions: capability.instructions };
        }),
      };
    },
  };

  const requestInputTool: ReactTool = {
    name: "request_resume_input",
    description:
      "读取已有资料后，按内容处理规则判断确需补充时，记录缺失信息并向用户提出一个明确问题。",
    parameters: {
      type: "object",
      properties: {
        missingFacts: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          uniqueItems: true,
          description: "继续任务确实缺少的事实列表。",
        },
        question: {
          type: "string",
          description: "准备向用户提出的单个明确问题。",
        },
        reason: {
          type: "string",
          description: "缺少这些事实会影响任务的原因。",
        },
      },
      required: ["missingFacts", "question", "reason"],
      additionalProperties: false,
    },
    execute: (args) => {
      if (!task) return { accepted: false, error: "请先调用 plan_resume_task 建立本轮任务" };
      if (options.allowTaskPause === false) {
        return { accepted: false, error: "当前入口不能暂停等待补充，请使用已有资料继续完成任务" };
      }
      // 一次性修复入口不允许把缺失信息抛回给用户，必须先用已有资料和占位补齐
      if (options.taskProfile?.allowRequestInput === false) {
        return { accepted: false, error: "当前入口不向用户追问，请使用已有资料或 XX 占位继续完成任务" };
      }
      if (
        !Array.isArray(args?.missingFacts) || !args.missingFacts.length ||
        args.missingFacts.some((item: unknown) => typeof item !== "string" || !item.trim()) ||
        typeof args?.question !== "string" || !args.question.trim() ||
        typeof args?.reason !== "string" || !args.reason.trim()
      ) {
        return { accepted: false, error: "缺失事实、问题和原因不能为空" };
      }
      if (task.requiredEffects.length && !toolExecution.hasFreshRead()) {
        return { accepted: false, error: "请先读取当前最新的简历或入口资料，再判断需要用户补充什么" };
      }
      task.phase = "waiting";
      task.pendingInput = {
        missingFacts: args.missingFacts.map((item: string) => item.trim()),
        question: args.question.trim(),
        reason: args.reason.trim(),
      };
      task.blocker = undefined;
      return { accepted: true, pendingInput: task.pendingInput };
    },
  };

  const reportBlockerTool: ReactTool = {
    name: "report_resume_blocker",
    description:
      "读取当前可用资料后，确认任务无法安全继续时记录阻塞原因。仅在继续执行会把未核实候选冒充事实、破坏数据或没有可操作内容时使用。",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "当前任务无法继续执行的具体原因。",
        },
        suggestion: {
          type: "string",
          description: "用户可以采取的解决方式；没有明确解决方式时省略。",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
    execute: (args) => {
      if (!task) return { accepted: false, error: "请先调用 plan_resume_task 建立本轮任务" };
      if (options.allowTaskPause === false) {
        return { accepted: false, error: "当前入口不能以阻塞状态结束，请使用已有资料继续完成任务" };
      }
      if (typeof args?.reason !== "string" || !args.reason.trim()) {
        return { accepted: false, error: "阻塞原因不能为空" };
      }
      if (task.requiredEffects.length && !toolExecution.hasFreshRead()) {
        return { accepted: false, error: "请先读取当前最新的简历或入口资料，再判断任务是否无法继续" };
      }
      task.phase = "blocked";
      task.blocker = {
        reason: args.reason.trim(),
        suggestion: typeof args.suggestion === "string" && args.suggestion.trim()
          ? args.suggestion.trim()
          : undefined,
      };
      task.pendingInput = undefined;
      return { accepted: true, blocker: task.blocker };
    },
  };

  // 多需求任务的收口确认工具：逐条核对清单处理结果，防止部分诉求被静默遗漏。
  const confirmRequirementsTool: ReactTool = {
    name: "confirm_resume_requirements",
    description:
      "任务收口前逐条确认需求清单的处理结果。带业务效果的需求必须先取得对应工具证据，确认不能替代证据；文字需求在最终回答中逐条回应后确认。写入后的复核读取可以与本工具同轮调用，节省执行轮次。单条需求无需调用。",
    parameters: {
      type: "object",
      properties: {
        results: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "需求条目标识，来自规划返回的需求清单。",
              },
              note: {
                type: "string",
                description: "该条需求的处理结果说明；尚未真正处理时不得确认。",
              },
            },
            required: ["id", "note"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
      additionalProperties: false,
    },
    execute: (args) => {
      if (!task) return { accepted: false, error: "请先调用 plan_resume_task 建立本轮任务" };
      // 固定当前任务引用：回调闭包内读取证据不依赖可变变量的收窄。
      const currentTask = task;
      const requirements = currentTask.requirements ?? [];
      // 单条任务沿用原有效果验收，不额外消耗确认轮次。
      if (requirements.length <= 1) {
        return { accepted: false, error: "本轮没有多需求清单，无需调用确认工具" };
      }
      if (!Array.isArray(args?.results) || !args.results.length) {
        return { accepted: false, error: "results 不能为空，请逐条提供需求确认结果" };
      }
      const byId = new Map(requirements.map((entry) => [entry.id, entry]));
      const unknownIds = args.results
        .filter((item: { id?: unknown }) => !byId.has(String(item?.id)))
        .map((item: { id?: unknown }) => String(item?.id));
      if (unknownIds.length) {
        return { accepted: false, error: `未找到需求条目：${unknownIds.join("、")}，请使用规划返回的需求清单标识` };
      }
      // 先整体校验再统一落账，避免部分确认后又被错误打断产生半截状态。
      for (const item of args.results) {
        const requirement = byId.get(String(item?.id))!;
        if (typeof item?.note !== "string" || !item.note.trim()) {
          return { accepted: false, error: `需求 ${requirement.id} 的处理说明不能为空` };
        }
        // 带业务效果的需求以真实证据为底线，确认只负责逐条核对，不放宽验收口径。
        const missingEffect = requirement.requiredEffects.find(
          (kind) => !hasFreshSuccessfulEvidence(currentTask.evidence, kind),
        );
        if (missingEffect) {
          return {
            accepted: false,
            error: `需求 ${requirement.id}「${requirement.objective}」还缺少${EVIDENCE_NAMES[missingEffect]}的成功证据，请先完成对应工具执行再确认`,
          };
        }
      }
      for (const item of args.results) {
        const requirement = byId.get(String(item?.id))!;
        requirement.status = "covered";
        requirement.note = item.note.trim();
      }
      const pending = requirements.filter((entry) => entry.status !== "covered");
      return {
        accepted: true,
        confirmed: args.results.map((item: { id?: unknown }) => String(item?.id)),
        // 剩余条目原样返回，提示模型继续处理而不是提前收口。
        ...(pending.length
          ? { pending: pending.map((entry) => ({ id: entry.id, objective: entry.objective })) }
          : { allCovered: true }),
      };
    },
  };

  // 规划缺失时按入口契约和实际工具效果建立隐式任务，保留按钮的验收策略。
  const ensureImplicitTask = (tool?: ResumeAgentTool) => {
    const target = tool?.taskMeta ? TOOL_EFFECT_TARGETS[tool.taskMeta.effect] : undefined;
    // 正式任务由规划结果决定验收口径，不再被工具效果覆盖
    if (task && !implicitTask) return;
    if (task && (!target || task.requiredEffects.includes(target))) return;
    const effects = [
      ...(options.taskProfile?.requiredEffects ?? options.fixedRequiredEffects ?? []),
      ...(task?.requiredEffects ?? []),
      ...(target ? [target] : []),
    ];
    const implicitPlanned = [...new Set(effects)];
    const implicitPolicies = options.taskProfile ? [options.taskProfile.completionPolicy] : [];
    policyInputs = { planned: implicitPlanned, policies: implicitPolicies };
    const resolvedPolicy = resolveResumeAgentCompletionPolicy(
      implicitPlanned,
      implicitPolicies,
      getToolMetas(),
    );
    completionPolicy = resolvedPolicy;
    task = {
      id: options.taskId,
      source: options.source,
      relation: "new", // 隐式任务不承接历史目标。
      objective: options.taskProfile?.objective ?? task?.objective ?? options.fallbackObjective?.trim() ?? "处理用户本轮请求",
      scope: task?.scope ?? "未明确指定",
      requiredEffects: resolvedPolicy.requiredEffects,
      successCondition: options.taskProfile?.successCondition ?? options.fixedSuccessCondition ??
        task?.successCondition ?? resolveDefaultSuccessCondition(resolvedPolicy.requiredEffects),
      capabilityIds: task?.capabilityIds ?? [],
      phase: task?.phase ?? "planned",
      evidence: task?.evidence ?? [],
    };
    implicitTask = true;
    console.warn("[简历助手] 未建立任务契约，已按工具效果建立隐式任务:", {
      source: options.source,
      tool: tool?.name ?? "入口任务",
      requiredEffects: resolvedPolicy.requiredEffects,
    });
    // 观测：降级建任务必须可见，否则无法解释验收口径为何放宽。
    options.onTrace?.({ type: "implicit", task: cloneResumeAgentTask(task)!, tool: tool?.name ?? "入口任务" });
  };

  // 多需求任务的收口核对：任何未确认条目都会拦截最终回答。
  // 单条任务由原有效果验收覆盖，不引入额外确认轮次。
  const checkRequirementCoverage = (): ResumeAgentIncompleteReason | null => {
    const requirements = task?.requirements ?? [];
    if (requirements.length <= 1) return null;
    const pending = requirements.filter((item) => item.status !== "covered");
    if (!pending.length) return null;
    const names = pending.map((item) => item.objective).join("；");
    return {
      code: "requirement_uncovered",
      target: pending.map((item) => item.id).join(","), // 未确认条目按稳定标识分别计数。
      detail: names,
      text: `需求清单还有未确认的条目：${names}。请先完成对应工具执行，再调用 confirm_resume_requirements 逐条确认处理结果。`,
    };
  };

  // 完成检查返回稳定编码，修正提示的变化不会重置同一问题的失败计数。
  const retryCheck = (issue: ResumeAgentIncompleteReason): AgentFinalCheck => ({
    status: "retry", // 当前业务条件尚未满足。
    issue: { code: issue.code, message: issue.text, target: issue.target }, // 原因编码、业务目标与修正文字分离。
  });

  const beforeFinal = (answer: string): AgentFinalCheck => {
    // 明确入口即使模型跳过规划，也必须执行入口约定的真实业务效果。
    if (!task && (options.taskProfile || options.fixedRequiredEffects?.length)) ensureImplicitTask();
    if (!task || (implicitTask && !task.requiredEffects.length)) {
      // 只读降级仍需确认用户究竟要求回复还是写入，不凭已读取就判完成。
      const reason = "尚未理解本轮任务，请调用 plan_resume_task 明确目标与必需业务效果。";
      incompleteReason = { code: "no_plan", text: reason };
      options.onTrace?.({ type: "verdict", completed: false, reason });
      return retryCheck(incompleteReason);
    }
    // 按钮任务可在最终输出前核对其专用结果契约。
    // 工具可能晚于规划才登记，收口前按最新工具约束重算一次，避免验收遗漏写入前置。
    if (policyInputs) {
      completionPolicy = resolveResumeAgentCompletionPolicy(
        policyInputs.planned,
        policyInputs.policies,
        getToolMetas(),
      );
    }
    // 已明确等待补充或阻塞时直接交付原因，报告格式不再阻止任务收口。
    if (task.phase === "waiting" || task.phase === "blocked") {
      incompleteReason = undefined;
      return {
        status: task.phase, // 等待补充与业务阻塞独立于完成状态。
        reason: {
          code: task.phase === "waiting" ? "task_waiting" : "task_blocked", // 明确暂停类型。
          message: task.pendingInput?.question ?? task.blocker?.reason ?? "当前任务已暂停", // 具体暂停原因。
        }, // 宿主无需解析最终回答判断暂停。
      };
    }
    // 多需求任务收口前逐条核对清单，防止部分诉求被静默遗漏。
    const requirementIssue = checkRequirementCoverage();
    if (requirementIssue) {
      incompleteReason = requirementIssue;
      options.onTrace?.({ type: "verdict", completed: false, reason: requirementIssue.text });
      return retryCheck(requirementIssue);
    }
    const finalIssue = options.taskProfile?.validateFinal?.(answer, task.evidence);
    if (finalIssue) {
      incompleteReason = finalIssue;
      // 报告校验的拦截原因也进入运行轨迹，供最后的未完成结果定位。
      options.onTrace?.({ type: "verdict", completed: false, reason: finalIssue.text });
      return retryCheck(finalIssue);
    }
    const result = evaluateResumeAgentCompletion(
      task.evidence,
      completionPolicy,
      options.allowTaskPause !== false,
    );
    if (result.completed) {
      task.phase = "completed";
      task.pendingInput = undefined;
      task.blocker = undefined;
      incompleteReason = undefined;
      // 观测：放行最终回答时记录结论。
      options.onTrace?.({ type: "verdict", completed: true, reason: null });
      return { status: "completed" /* 真实工具证据已经满足任务条件。 */ };
    }
    task.phase = "verifying";
    // 保留结构化原因：回给模型的是具体说明，交给用户的是按编码映射的话术。
    incompleteReason = result.reason ?? {
      code: "unresolved",
      text: "本轮任务尚未满足完成条件，请继续核对工具结果。",
    };
    // 观测：拦截过早收口时记录拦截原因，排障依赖这条信号。
    options.onTrace?.({ type: "verdict", completed: false, reason: incompleteReason.text });
    return retryCheck(incompleteReason);
  };

  // 未完成原因映射为用户话术：内部校验细节只回给模型，不直接展示给用户
  const describeIncompleteReason = (issue: ResumeAgentIncompleteReason) => {
    switch (issue.code) {
      case "no_plan":
        return "尚未确认本轮要做什么。";
      case "missing_evidence":
        return `还差${issue.detail ?? "必要步骤"}没有完成。`;
      case "missing_facts":
        return "工具结果里还有未完成的项。";
      case "stale_read":
        return `已完成${issue.detail ?? "修改"}，但还需要基于最新数据重新核对。`;
      case "evidence_order":
        return "操作顺序不符合要求，结果没有生效。";
      case "scope_uncovered":
        return `这些内容还没有实际改动：${issue.detail ?? "部分模块"}。`;
      case "requirement_uncovered":
        return `还有未确认的需求：${issue.detail ?? "部分条目"}。`;
      case "report_invalid":
        return issue.text;
      case "report_mismatch":
        return "报告里列出的改动与实际写入不一致。";
      default: {
        // 未归类原因去掉给模型的续做指令，避免术语直接出现在结果里
        const text = issue.text.replace(/[，。]\s*请继续[\s\S]*$/, "。");
        return /执行轮次|通过校验/.test(text) ? "这轮没能按要求完成，可以把要求拆小一点再试。" : text;
      }
    }
  };

  // 汇总本轮真实写入的改动，让用户在未完成时也能看到已经生效的部分
  const summarizeCompletedChanges = (evidence: ResumeAgentTaskEvidence[]) => {
    const items = evidence.flatMap((item) => item.verifiedChanges ?? []);
    if (!items.length) return "";
    const shown = items.slice(0, 5).map((item) => `${item.module}·${item.summary}`).join("；");
    const rest = items.length > 5 ? `等 ${items.length} 项` : "";
    return `本轮已完成的改动：${shown}${rest}。`;
  };

  const onIncomplete = (reason: AgentIssue) => {
    // 轮次耗尽时保留已发生的业务事实，并明确标记任务未完成。
    const issue: ResumeAgentIncompleteReason = incompleteReason ?? {
      code: "unresolved",
      text: reason.message,
    };
    incompleteReason = undefined;
    const completedChanges = task?.evidence.filter((item) =>
      item.kind === "resume_change" && !item.replayed && item.changed === true && item.status !== "failed"
    ) ?? [];
    if (task && task.phase !== "waiting" && task.phase !== "blocked") {
      task.phase = "incomplete";
      task.pendingInput = undefined;
    }
    const detail = reason.code === "repeated_failure" ? reason.message : task?.phase === "waiting" && task.pendingInput
      ? task.pendingInput.question
      : task?.blocker?.reason ?? describeIncompleteReason(issue);
    const changeNotice = completedChanges.length
      ? `${summarizeCompletedChanges(completedChanges)}\n\n已写入的修改仍保留在简历中，可使用撤回修改。\n\n`
      : "";
    return `${changeNotice}本轮任务尚未完成：${detail}`;
  };

  const buildContext = () => {
    const previousContext = previousTask
      ? {
          id: previousTask.id, // 上一任务标识。
          source: previousTask.source, // 上一任务入口。
          objective: previousTask.objective, // 上一任务目标。
          scope: previousTask.scope, // 上一任务作用范围。
          requiredEffects: previousTask.requiredEffects, // 上一任务要求真实产生的业务效果。
          successCondition: previousTask.successCondition, // 上一任务的用户可核对完成条件。
          capabilityIds: previousTask.capabilityIds, // 上一任务使用的能力。
          requirements: previousTask.requirements, // 上一任务的需求清单与逐条状态。
          phase: previousTask.phase, // 上一任务结束阶段。
          pendingInput: previousTask.pendingInput, // 上一任务等待补充的信息。
          blocker: previousTask.blocker, // 上一任务阻塞原因。
        }
      : null;
    const previous = previousContext
      ? `\n上一轮任务状态（仅作为承接判断资料）：${JSON.stringify(previousContext)}`
      : "";
    const pauseRule = options.allowTaskPause === false
      ? "当前入口不支持追问或阻塞结束，缺少字段时依据已有资料继续完成；未知细节使用 XX 占位，不得冒充已确认事实。"
      : allowRequestInput
        ? "需要补充时使用 request_resume_input，确认无法安全执行时使用 report_resume_blocker。"
        : "当前入口不向用户追问：缺少事实时按共用写作规则使用 XX 占位补齐，只能取固定选项的字段保留原值；确实无法继续时使用 report_resume_blocker 说明剩余项。";
    const taskProfile = options.taskProfile
      ? `\n# 当前按钮任务\n目标：${options.taskProfile.objective}\n完成条件：${options.taskProfile.successCondition}\n${options.taskProfile.instructions}`
      : "";
    // 需求清单规则只对支持清单的入口生效，固定入口不注入无关指令。
    const requirementRule = allowRequirements
      ? "用户一条消息包含多个诉求时，规划必须逐条拆入 requirements，不得合并或遗漏；objective 只写一句概括，逐条诉求进 requirements。执行和最终回答按清单逐条核对，收口前调用 confirm_resume_requirements 确认每条结果，确认不能替代真实工具证据；写入后的复核读取可以与 confirm_resume_requirements 同轮调用，不必单独消耗一轮。revise 需要重做上一任务已确认的条目时，必须把该条重新拆入 requirements。"
      : "";
    return `# 任务运行规则
当前入口：${options.source}。
先调用 plan_resume_task 建立本轮任务契约，各项参数按工具说明填写；上一任务的等待状态仅供参考，按当前目标重新判断能否执行。
${requirementRule ? `${requirementRule}\n` : ""}规划后自行决定步骤与工具：需要事实依据时读取资料，需要实际业务变化时调用对应工具，不以文字答复代替提交。
写入前核对作用范围、字段与布局；只有需要写入或核对字段格式时才读取数据规范，并按目标模块读取。根据工具结果处理部分失败，只继续未完成的部分；后续判断依赖最新数据或任务要求写后复核时重新读取。只有实际证据满足完成条件才说明完成，不制造无关改动或重复提交相同参数。
缺少会改变结果的关键事实时先核对已有资料；确实无法继续时按当前入口的暂停规则处理，不消耗轮次反复生成最终回答。${pauseRule}
最终回答只区分实际完成的结果、带 XX 占位的内容和未完成原因。

# 内容处理规则
${OPTIONAL_FIELD_RULE}
${DRAFT_REQUEST_RULE}${taskProfile}${previous}`;
  };

  // 固定入口没有清单机制，确认工具不进入声明，节省每轮请求的工具声明开销。
  const requirementConfirmTools = allowRequirements ? [confirmRequirementsTool] : [];

  return {
    // 任务控制工具用于规划、需求确认、等待补充和记录阻塞；关闭追问时只保留规划、需求确认与阻塞。
    controlTools: options.allowTaskPause === false
      ? [planTaskTool, ...requirementConfirmTools]
      : allowRequestInput
        ? [planTaskTool, ...requirementConfirmTools, requestInputTool, reportBlockerTool]
        : [planTaskTool, ...requirementConfirmTools, reportBlockerTool],
    // 包装业务工具并记录真实执行证据；执行前补齐隐式任务。
    wrapTools: (tools: ReactTool[]) => {
      // 包装阶段补登记：创建后才加入的工具同样参与验收推导。
      registerToolMetas(tools);
      const wrapped = toolExecution.wrapTools(tools);
      return wrapped.map((tool, index) => {
        const source = tools[index] as ResumeAgentTool;
        return {
          ...tool,
          execute: (args: unknown) => {
            ensureImplicitTask(source);
            return tool.execute(args);
          },
        };
      });
    },
    // 最终答案提交前的通用完成检查。
    beforeFinal,
    // 达到执行上限时由任务运行时生成未完成结果，避免丢失真实状态。
    onIncomplete,
    // 提供给同一 Agent 的任务运行上下文。
    buildContext,
    // 返回可持久化的当前任务快照。
    getTask: () => cloneResumeAgentTask(task),
  };
};
