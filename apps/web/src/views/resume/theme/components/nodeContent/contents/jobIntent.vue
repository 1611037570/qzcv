<script setup lang="ts">
import { computed } from "vue";
import { JOB_INTENT_FIELDS } from "@snowflake/resume-core";
import { useResumePreviewContext } from "@/views/resume/editor/preview/shared/previewContext";
import { getPreviewText } from "@/views/resume/editor/preview/shared/i18n";
import { $t } from "@/locales";
import UserContactItem from "../../userModule/components/userContactItem.vue";
import { resolveIcon } from "@/views/resume/editor/data/iconCategories";
import type { NodeContentProps } from "@/views/resume/editor/preview/resumePages/render/nodeContentContract";

// 与公共测量和预览节点共用属性协议，避免节点数据落成元素属性。
const props = defineProps<NodeContentProps>();
const { data, lang, ui } = useResumePreviewContext();
// 求职意向展示模式从简历级 UI 配置读取。
const infoMode = computed(() => ui.value.jobIntent.infoMode);
// 仅显示有内容且未隐藏的求职字段，沿用现有资料项的标签和文本渲染。
const fields = computed(() => {
  // 使用编辑器保存的字段顺序，未调整的字段继续按默认顺序补齐。
  const payload = (props.payload ?? props.node.payload) as { fieldOrder?: string[] /* 当前求职字段顺序。 */ };
  const order = new Set([...(payload?.fieldOrder || []), ...JOB_INTENT_FIELDS]);
  return [...order].filter((key) => JOB_INTENT_FIELDS.includes(key as typeof JOB_INTENT_FIELDS[number])).flatMap((key) => {
  const module = data.value.jobIntent;
  const value = module?.data?.[key];
  if (!value || module?.ui?.[key]?.hidden === true) return [];
  return [{
    key, // 求职字段标识。
    value: key === "salary" ? String(value).replace(/^(.+?)k-$/i, `$1k${$t("themeDeco_salaryAbove")}`) : value, // 未完成薪资区间沿用个人信息的展示规则。
    label: getPreviewText(`${key}Label`, lang.value), // 跟随简历语言的字段名称。
    icon: resolveIcon(module?.ui?.[key]?.icon), // 保留迁移时的字段图标。
  }];
  });
});
</script>

<template>
  <div class="flex min-w-0 flex-wrap gap-3">
    <UserContactItem v-for="field in fields" :key="field.key" :label="field.label" :icon="field.icon" :model-value="field.value" :icon-mode="infoMode === 'icon'" :hide-label="infoMode === 'none'" flow-mode />
  </div>
</template>
