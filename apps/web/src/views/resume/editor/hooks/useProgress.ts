import { toValue, type MaybeRefOrGetter } from "vue";
import {
  createDataPathContext,
  getArrayDataPath,
  getFieldLabel,
  getModelBindings,
  resolveDataPath,
  unwrapField,
  walkFormFields,
} from "@/components/business/dynamicForm/api";
import { $t } from "@/locales";
import { isContentEmpty } from "../../shared/validData";
import { formatResumeCheckIssue, type ResumeCheckIssue, type ResumeCheckTarget } from "./resumeChecks";

// ==================== 工具函数 ====================

const getValueByPath = (obj: any, path: (string | number)[]): any => {
  let cur = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
};

// 可添加字段只有数据路径已创建后才进入完成度和 ATS 统计。
const hasDataPath = (obj: any, path: (string | number)[]): boolean => {
  let cur = obj;
  for (const key of path) {
    if (cur == null || !Object.prototype.hasOwnProperty.call(cur, key)) return false;
    cur = cur[key];
  }
  return true;
};

const isEmpty = (val: any): boolean =>
  val == null ||
  (typeof val === "string" && val.trim() === "") ||
  (Array.isArray(val) && val.length === 0) ||
  (typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0);

// 复合可选字段的子项全空时不参与格式检查。
const isDeepEmpty = (val: any): boolean =>
  isEmpty(val) ||
  (Array.isArray(val) && val.every(isDeepEmpty)) ||
  (typeof val === "object" && !Array.isArray(val) && Object.values(val).every(isDeepEmpty));

// 完成度只统计字段上手动标记的必填口径，不由校验规则或所在分组推导。
const isRequiredField = (field: any): boolean => field?.required === true;

// 所有检查从同一入口生成问题，界面与助手不再分别拼装问题来源。
const createIssue = (
  kind: ResumeCheckIssue["kind"],
  ruleId: string,
  label: string,
  message: string,
  target: ResumeCheckTarget,
  severity: ResumeCheckIssue["severity"] = "warning",
): ResumeCheckIssue => ({
  ruleId, // 检查规则编号
  kind, // 检查分类
  label, // 问题显示名称
  message, // 问题说明
  severity, // 提示等级
  target, // 编辑位置
});

const getRuleIssues = (rules: any[], value: unknown, label: string, target: ResumeCheckTarget): ResumeCheckIssue[] => {
  if (isDeepEmpty(value)) return [];
  return rules.flatMap((rule) => {
    if (rule?.pattern instanceof RegExp) {
      if (typeof value !== "string" && typeof value !== "number") return [];
      rule.pattern.lastIndex = 0;
      return rule.pattern.test(String(value))
        ? []
        : [createIssue("format", `pattern:${rule.pattern.source}/${rule.pattern.flags}`, label, rule.message || $t("invalidFormat"), target, "error")];
    }

    const atsRule = rule?.ats;
    if (!atsRule?.type) return [];
    const addIssue = (message: string, issueLabel = label) => [
      createIssue("format", `ats:${atsRule.type}`, issueLabel, message, target, atsRule.severity || "warning"),
    ];
    if (atsRule.type === "wechat") {
      return /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/.test(String(value))
        ? []
        : addIssue($t("atsWechatFormat"));
    }
    if (["url", "projectLink", "socialLink"].includes(atsRule.type)) {
      const urlValue =
        typeof value === "string"
          ? value
          : value && typeof value === "object"
            ? value.url
            : "";
      if (!urlValue) {
        const hasLinkName = value && typeof value === "object" && !isDeepEmpty(value.name);
        return hasLinkName ? addIssue($t("atsLinkRequired")) : [];
      }
      const input = String(urlValue).trim();
      try {
        const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
        const parsed = new URL(normalized);
        return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname.includes(".")
          ? []
          : addIssue($t("atsUrlFormat"));
      } catch {
        return addIssue($t("atsUrlFormat"));
      }
    }
    if (atsRule.type === "numberFields") {
      return (atsRule.fields ?? []).flatMap((field: any) => {
        const fieldValue = value?.[field.key];
        if (isDeepEmpty(fieldValue)) return [];
        const normalized = String(fieldValue).trim().replace(/\s*(cm|kg|厘米|公斤)$/i, "");
        const number = Number(normalized);
        return Number.isFinite(number) && number >= field.min && number <= field.max
          ? []
          : addIssue($t("atsNumberRange", { min: field.min, max: field.max }), $t(field.label));
      });
    }
    if (atsRule.type === "salaryRange") {
      // k 后缀可缺省且大小写不敏感，与 salaryRange 组件的解析规则保持一致
      const match = String(value).match(/^(\d+(?:\.\d+)?)k?-(?:(\d+(?:\.\d+)?)k?)?$/i);
      const above = String(value).match(/^(\d+(?:\.\d+)?)k?以上$/i);
      if (above) return Number(above[1]) > 0 ? [] : addIssue($t("atsSalaryRange"));
      if (!match || Number(match[1]) <= 0) return addIssue($t("atsSalaryRange"));
      if (match[2] && Number(match[2]) <= Number(match[1])) return addIssue($t("atsSalaryOrder"));
      return [];
    }
    if (atsRule.type === "contentQuality") {
      if (isContentEmpty(String(value))) return [];
      const content = String(value)
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (/待补充|待完善|请填写|TODO|TBD|XXX/i.test(content)) {
        return addIssue($t("atsPlaceholderContent"));
      }
      return Array.from(content).length < 20 ? addIssue($t("atsContentTooShort")) : [];
    }
    return [];
  });
};

// 模块名称优先读取 ui.title，缺失时回退标题模型默认值
const getModuleTitle = (config: any, rootData: Record<string, any>, key: string): string =>
  rootData?.[key]?.ui?.title ||
  config.model?.find((item: any) => item?.prop === "title")?.defaultValue ||
  key;

const getFieldMeta = (field: any) => {
  const model = field?.model ? (Array.isArray(field.model) ? field.model[0] : field.model) : field;
  const src = Array.isArray(model?.source) ? model.source : [];
  const prop = model?.prop || src[src.length - 1] || "";
  return { src, prop };
};

// 内部状态字段：折叠与隐藏只影响展示，不作为填写项统计
const INTERNAL_FIELD_KEYS = new Set(["collapsed", "hidden"]);

// 是否属于内部状态字段：绑定了 ui 节点，或字段标识是折叠与隐藏
const isInternalField = (field: any) => {
  const { src, prop } = getFieldMeta(field);
  return src.includes("ui") || INTERNAL_FIELD_KEYS.has(prop);
};

// 记录项模型字段没有配置标签，按编辑组件映射到对应的中文文案
const ITEM_FIELD_LABELS: Record<string, Record<string, string>> = {
  // 社交账号：平台与链接
  rowAccount: { name: "platform", url: "link" },
  // 技能列表：技能名称、描述与熟练度
  rowSkill: { name: "skillName", desc: "skillDescription", level: "proficiencyLevel" },
};

// ==================== 分析单个模块 ====================

function analyzeModule(moduleConfig: any, rootData: any, ui?: any) {
  if (!moduleConfig?.fields?.length) {
    return { issues: [] as ResumeCheckIssue[] /* 模块问题 */, score: 0 /* 模块完成度 */, done: 0 /* 已填必填项 */, total: 0 /* 必填项总数 */ };
  }

  // 同时声明对象与数组字段时，按表单配置的布局开关判断当前生效形态
  const listLayout = moduleConfig.props?.addWhenLayout;
  const activeLayout = ui?.[moduleConfig.key]?.layout;

  const issues: ResumeCheckIssue[] = [];
  const moduleTarget: ResumeCheckTarget = { moduleKey: moduleConfig.key /* 所属模块编号 */ };
  const addMissing = (label: string, target = moduleTarget) => {
    issues.push(createIssue("missing", "required", label, `${$t("missingPrefix")}${label}`, target));
  };
  let done = 0;
  let total = 0;
  // 模块字段统一从分组上下文解析相对路径
  const moduleContext = moduleConfig.context?.length
    ? createDataPathContext(moduleConfig.context)
    : undefined;
  const moduleFields: Array<{ field: any; inheritedRules: any[]; inheritedLabel?: string }> = [];
  const collectModuleFields = (
    fields: any[],
    inheritedRules: any[] = [],
    inheritedLabel?: string,
  ) => {
    for (const candidate of fields) {
      if (candidate.type === "group") {
        collectModuleFields(
          candidate.fields ?? [],
          [...inheritedRules, ...(candidate.rules ?? [])],
          candidate.props?.label || inheritedLabel,
        );
      } else {
        moduleFields.push({ field: candidate, inheritedRules, inheritedLabel });
      }
    }
  };
  // 展开个人信息等包裹组，让其中的动态字段也参与 ATS 检查。
  collectModuleFields(moduleConfig.fields);

  for (const { field, inheritedRules, inheritedLabel } of moduleFields) {
    // 可切换形态的模块只统计当前布局对应字段
    if (listLayout && (field.type === "array") !== (activeLayout === listLayout)) continue;
    if (field.type === "array" && field.itemSchema) {
      const itemSchema = field.itemSchema;
      // 记录项模型字段没有配置标签时，按编辑组件映射到中文文案
      const itemLabelKeys = ITEM_FIELD_LABELS[itemSchema?.component] || {};
      const getItemLabel = (def: any) => {
        const own = getFieldLabel(def.field);
        if (own) return own;
        const key = itemLabelKeys[getFieldMeta(def.target).prop];
        return key ? $t(key) : "";
      };
      const itemDefs: Array<{ field: any; target: any; required: boolean }> = [];
      const collectItemFields = (fields: any[], inheritedRequired: boolean) => {
        for (const candidate of fields) {
          const required = inheritedRequired || isRequiredField(candidate);
          if (candidate.type === "group") {
            collectItemFields(candidate.fields ?? [], required);
            continue;
          }
          const target = unwrapField(candidate) ?? candidate;
          itemDefs.push({
            field: candidate,
            target,
            required: required || isRequiredField(target),
          });
        }
      };
      if (itemSchema.fields?.length) {
        // 子字段只遵循自身的必填规则，避免把可选字段一并计入
        collectItemFields(itemSchema.fields, false);
      } else {
        const bindings = Array.isArray(itemSchema.model)
          ? itemSchema.model
          : itemSchema.model
            ? [itemSchema.model]
            : [];
        for (const binding of bindings) {
          // 自定义条目的子字段只遵循绑定自身的 required 标记
          itemDefs.push({
            field: binding,
            target: binding,
            required: binding?.required === true,
          });
        }
      }
      if (!itemDefs.length) continue;

      const listPath = getArrayDataPath(field, moduleContext) || [];
      const list = getValueByPath(rootData, listPath);
      const listTarget: ResumeCheckTarget = {
        moduleKey: moduleConfig.key, // 所属模块编号
        listPath, // 数组容器路径
      };

      if (!Array.isArray(list) || list.length === 0) {
        let hasRequired = false;
        for (const def of itemDefs) {
          // 内部状态字段与无法解析中文文案的字段不参与完成度统计
          const label = getItemLabel(def);
          if (isInternalField(def.target) || !label) continue;
          if (!def.required) continue;
          hasRequired = true;
          total += 1;
          addMissing(label, listTarget);
        }
        if (hasRequired) {
          // 记录项本身配置了标签时一并提示，未配置标签时不再用通用文案占位
          const groupLabel = getFieldLabel(itemSchema);
          if (groupLabel) addMissing(groupLabel, listTarget);
        }
        continue;
      }

      list.forEach((_: any, idx: number) => {
        const recordTarget: ResumeCheckTarget = {
          ...listTarget, // 所属模块与数组路径
          record: list[idx], // 当前记录引用，不把下标当作身份保存
        };
        issues.push(
          ...getRuleIssues(
            itemSchema.rules ?? [],
            { name: list[idx]?.data?.name, url: list[idx]?.data?.url },
            `${getFieldLabel(itemSchema) || $t("socialAccounts")} · ${$t("recordIndex", { index: idx + 1 })}`,
            recordTarget,
          ),
        );
        for (const def of itemDefs) {
          const { src } = getFieldMeta(def.target);
          if (!src.length) continue;
          // 内部状态字段与无法解析中文文案的字段不参与完成度统计
          const itemLabel = getItemLabel(def);
          if (isInternalField(def.target) || !itemLabel) continue;

          // 数组子项字段基于当前记录上下文解析为完整数据路径
          const path = resolveDataPath(src, { basePath: listPath, index: idx });
          const value = getValueByPath(rootData, path);

          const rules = [
            ...(def.field.rules ?? []),
            ...(def.target === def.field ? [] : (def.target.rules ?? [])),
          ];
          issues.push(
            ...getRuleIssues(
              rules,
              value,
              `${itemLabel} · ${$t("recordIndex", { index: idx + 1 })}`,
              recordTarget,
            ),
          );
          if (!def.required) continue;

          // 修改：使用 src 最后一个元素判断是否为 content
          const filled =
            src[src.length - 1] === "content" ? !isContentEmpty(value) : !isEmpty(value);

          total += 1;
          if (filled) {
            done += 1;
          } else {
            addMissing(`${itemLabel} · ${$t("recordIndex", { index: idx + 1 })}`, recordTarget);
          }
        }
      });
      continue;
    }

    // 字段被包裹组件包裹时，必填与数据路径以内层字段为准
    const target = unwrapField(field) ?? field;
    const { src, prop } = getFieldMeta(target);
    if (!src.length) continue;
    // 内部状态字段不参与完成度统计
    if (isInternalField(target)) continue;

    const resolvedPath = resolveDataPath(src, moduleContext);
    const required = isRequiredField(target) || isRequiredField(field);
    // 必填的可添加字段未添加时也要提示；可选的可添加字段未添加时直接忽略
    if ((field.addable || target.addable) && !hasDataPath(rootData, resolvedPath) && !required) {
      continue;
    }
    const value = getValueByPath(rootData, resolvedPath);
    const rules = [
      ...inheritedRules,
      ...(field.rules ?? []),
      ...(target === field ? [] : (target.rules ?? [])),
    ];
    // 正文控件没有独立标签时用统一文案，其余字段必须配置中文标签才展示
    const isContentField = ["wangEditor", "resumeContentEditor"].includes(target.component);
    const fieldLabel = getFieldLabel(field) || inheritedLabel || "";
    if (!fieldLabel && !isContentField) continue;
    issues.push(...getRuleIssues(rules, value, fieldLabel || $t("content"), moduleTarget));

    // 修改：使用 src 最后一个元素判断是否为 content
    const filled = src[src.length - 1] === "content" ? !isContentEmpty(value) : !isEmpty(value);

    if (!required) continue;

    total += 1;
    if (filled) {
      done += 1;
    } else {
      const label = isContentField ? $t("content") : fieldLabel;
      addMissing(label);
    }
  }

  // 模块没有必填项时视为已填完，避免出现「0% 但无可填项」
  const score = total ? Math.round((done / total) * 10) : 10;
  // 同一记录的同类提示去重，不合并不同记录上相同的缺失或格式问题。
  const uniqueIssues = issues.filter((issue, index) => issues.findIndex((other) =>
    other.ruleId === issue.ruleId && other.kind === issue.kind && other.label === issue.label &&
    other.message === issue.message && other.target.record === issue.target.record &&
    JSON.stringify(other.target.listPath) === JSON.stringify(issue.target.listPath),
  ) === index);
  return {
    issues: uniqueIssues, // 统一模块问题
    score, // 模块完成度
    done, // 已填必填项数量
    total, // 必填项总数
  };
}

// ==================== 时间线一致性检查 ====================

const GAP_THRESHOLD_MONTHS = 6;

const parseMonth = (str: any) => {
  if (typeof str !== "string") return null;
  const match = str.match(/^(\d{4})\.(0[1-9]|1[0-2])$/);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]);
};

// 当前月份，与 parseMonth 同为"年 * 12 + 月"的数值
const currentMonth = () => {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth() + 1;
};

const formatGap = (months: number) => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years && rest) return $t("gapYearsMonths", { years, months: rest });
  if (years) return $t("gapYears", { years });
  return $t("gapMonths", { months: rest });
};

function checkTimeline(modules: Array<{ key: string /* 模块编号 */; config: any /* 表单配置 */ }>, rootData: any) {
  const issues: ResumeCheckIssue[] = [];

  for (const { key, config } of modules) {
    const arrayField = config.fields?.find((field: any) => field.type === "array");
    const moduleContext = config.context?.length
      ? createDataPathContext(config.context)
      : undefined;
    const listPath = getArrayDataPath(arrayField, moduleContext) || [];
    // 时间线记录统一按数组容器声明的数据源读取
    const items = getValueByPath(rootData, listPath);
    if (!Array.isArray(items) || !items.length) continue;

    let startTimePath: string[] = [];
    let endTimePath: string[] = [];
    walkFormFields(config.fields, (field) => {
      const binding = getModelBindings(field)[0];
      if (field.type !== "object" || !binding?.source) return;
      // 时间线只关注记录内的开始时间与结束时间字段
      const fieldKey = binding.source[binding.source.length - 1];
      if (fieldKey === "startTime") startTimePath = binding.source;
      if (fieldKey === "endTime") endTimePath = binding.source;
    });
    if (!startTimePath.length) continue;

    const entries = items
      .map((item: any, index: number) => {
        const startValue = getValueByPath(
          rootData,
          resolveDataPath(startTimePath, { basePath: listPath, index }),
        );
        const endValue = endTimePath.length
          ? getValueByPath(rootData, resolveDataPath(endTimePath, { basePath: listPath, index }))
          : null;
        const start = parseMonth(startValue);
        // 结束时间为"至今"时按当前月参与计算，缺省时沿用开始时间
        const end = endValue === "至今" ? currentMonth() : (parseMonth(endValue) ?? start);
        return { item, index, name: item?.data?.name || "", start, end };
      })
      .filter((e: any) => e.start != null && e.end != null);

    if (!entries.length) continue;

    const sorted = entries.filter((entry: any) => entry.end >= entry.start).sort((a: any, b: any) => a.start - b.start);
    const getTarget = (entry: any): ResumeCheckTarget => ({
      moduleKey: key, // 所属模块编号
      listPath, // 时间线记录容器路径
      record: entry.item, // 时间线问题对应的记录引用
    });

    for (const entry of entries) {
      const entryLabel = `${entry.name || $t("unnamed")} · ${$t("recordIndex", { index: entry.index + 1 })}`;
      if (entry.start > entry.end) {
        issues.push(createIssue("timeline", "timeline:range", $t("issueRange"), $t("timelineRangeMessage", { entry: entryLabel /* 问题记录名称 */ }), getTarget(entry)));
      }
      if (
        // 实习经历沿用工作经历的未来日期检查。
        ["work", "internship", "project"].includes(key) &&
        (entry.start > currentMonth() || entry.end > currentMonth())
      ) {
        issues.push(createIssue("timeline", "timeline:future", $t("issueFuture"), $t("timelineFutureMessage", { entry: entryLabel /* 问题记录名称 */ }), getTarget(entry)));
      }
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].start - sorted[i].end;
      if (gap > GAP_THRESHOLD_MONTHS) {
        issues.push(createIssue(
          "timeline", "timeline:gap", $t("issueGap"),
          $t("timelineGapMessage", {
            current: sorted[i + 1].name || $t("unnamed"), // 空档后的记录名称
            previous: sorted[i].name || $t("unnamed"), // 空档前的记录名称
            gap: formatGap(gap), // 空档时长说明
          }), getTarget(sorted[i + 1]),
        ));
      }
    }

  }

  return issues;
}

// ==================== useProgress ====================

export function useProgress(
  fields: MaybeRefOrGetter<any[]>,
  data: MaybeRefOrGetter<Record<string, any>>,
  ui?: MaybeRefOrGetter<Record<string, any>>,
) {
  const fieldsList = toValue(fields) || [];
  const rootData = toValue(data) || {};
  // 界面配置用于判断双形态模块当前生效的布局
  const uiConfig = (ui ? toValue(ui) : null) || {};

  const moduleMap = new Map<string, any>();
  for (const f of fieldsList) {
    if (f?.key) moduleMap.set(f.key, f);
  }

  const progressItems: Array<{
    key: string; // 模块编号
    name: string; // 模块显示名称
    progress: number; // 必填项完成百分比
    issues: ResumeCheckIssue[]; // 模块的统一问题清单
  }> = [];
  // 必填项累计：总完成度按必填项数量加权，而不是模块等权
  let requiredDone = 0;
  let requiredTotal = 0;
  const timelineModules: Array<{ key: string /* 模块编号 */; config: any /* 表单配置 */ }> = [];

  for (const [key, config] of moduleMap) {
    const { issues, score, done, total } = analyzeModule(
      config,
      rootData,
      uiConfig,
    );
    progressItems.push({
      key, // 模块编号
      name: getModuleTitle(config, rootData, key), // 模块显示名称
      progress: score * 10, // 必填项完成百分比
      issues, // 模块问题清单
    });
    requiredDone += done;
    requiredTotal += total;

    if (config.fields?.some((f: any) => f.type === "array" && f.itemSchema)) {
      timelineModules.push({ key /* 模块编号 */, config /* 表单配置 */ });
    }
  }

  // 总完成度 = 已填必填项 ÷ 必填项总数
  const totalProgress = requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 0;
  const timelineIssues = checkTimeline(timelineModules, rootData);
  // 时间线问题归回对应模块，界面与助手只消费这一份问题结果。
  progressItems.forEach((item) => {
    item.issues = [
      ...item.issues.filter((issue) => issue.kind === "format"),
      ...item.issues.filter((issue) => issue.kind === "missing"),
      ...timelineIssues.filter((issue) => issue.target.moduleKey === item.key),
    ];
  });
  const issues = progressItems.flatMap((item) => item.issues);

  return {
    list: progressItems, // 各模块完成度与问题清单
    requiredDone, // 已填写的必填项数量
    requiredTotal, // 必填项总数
    progress: totalProgress, // 总完成百分比
    // 存在格式错误时供入口切换警示状态
    hasError: issues.some((issue) => issue.severity === "error"),
    issues, // 全部问题的统一列表
  };
}

// 将完成度与时间线检查统一整理为一键调整可复用的问题清单
export const collectResumeAdjustmentIssues = (result: ReturnType<typeof useProgress>): string[] => {
  return result.list.flatMap((item) => item.issues.map((issue) => `${item.name}：${formatResumeCheckIssue(issue)}`));
};
