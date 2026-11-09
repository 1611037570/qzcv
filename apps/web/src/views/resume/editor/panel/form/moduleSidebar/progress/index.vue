<script setup>
// 完成度入口：挂在模块树顶部，显示总进度并可打开完成度详情
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { TransitionPresets, useTransition } from "@vueuse/core";
import { useResumeStore } from "@/stores";
import { useProgress } from "../../../../hooks/useProgress";
import { formatResumeCheckIssue } from "../../../../hooks/resumeChecks";
import { jumpToCheckTarget } from "../../../../hooks/useModuleNav";
import { useResumeStats } from "../../../../hooks/useResumeStats";
import { $t } from "@/locales";
import eventBus from "@/utils/modules/eventBus";
import OneKeyIntro from "../../../../components/oneKeyIntro.vue";
import { useOneKeyActions } from "../../../../hooks/useOneKeyActions";

const resumeStore = useResumeStore();
const { currentData, runtimeFields, currentUI, isGenerating } = storeToRefs(resumeStore);

// 优化交给独立弹窗，调整仍在确认说明后启动助手流程。
const { introVisible, openOneKeyIntro, confirmOneKeyIntro } = useOneKeyActions(
  (flow) => eventBus.emit("resume-start-assistant-flow", flow),
);

// 详情弹窗显隐
const visible = ref(false);

// 总进度与各模块进度（含时间线一致性检查结果），传入界面配置用于判断双形态模块布局
const progressData = computed(() =>
  useProgress(runtimeFields.value || [], currentData.value, currentUI.value),
);
// 保留数据引用，切换简历及撤销替换数据后重新统计当前内容
const resumeStats = useResumeStats(computed(() => currentData.value || {}), currentUI);
// 分类计数只遍历一次，入口摘要与提示共用同一结果。
const issueCounts = computed(() => {
  const counts = { missing: 0 /* 缺失项数量 */, format: 0 /* 格式问题数量 */, timeline: 0 /* 时间问题数量 */ };
  progressData.value.issues.forEach((issue) => counts[issue.kind]++);
  return counts;
});
const issueSummary = computed(() => Object.entries({
  missing: "resumeMissingCount", // 缺失项摘要文案
  format: "resumeFormatIssueCount", // 格式问题摘要文案
  timeline: "resumeTimelineIssueCount", // 时间问题摘要文案
}).flatMap(([kind, label]) => {
  const count = issueCounts.value[kind];
  return count ? [$t(label, { count /* 当前分类的问题数量 */ })] : [];
}));

// 总进度数字过渡动画
const animatedProgress = useTransition(computed(() => progressData.value.progress), {
  duration: 500,
  transition: TransitionPresets.easeOutCubic,
});

// 缺失、格式或时间线任一检查未通过时先调整，全部通过后才进入内容优化。
const needsAdjustment = computed(
  () => progressData.value.progress < 100 || progressData.value.issues.length > 0,
);
const aiActionLabel = computed(() => $t(isGenerating.value
  ? needsAdjustment.value ? "adjustingResume" : "optimizingResume"
  : needsAdjustment.value ? "oneClickAdjust" : "oneClickOptimize"));
// 调整使用警示色提示尚有问题，全部通过后的优化使用成功色。
const aiActionClass = computed(() =>
  needsAdjustment.value
    ? "bg-sf-warning-2 text-sf-warning hover:bg-sf-warning hover:text-white"
    : "bg-sf-success-2 text-sf-success hover:bg-sf-success hover:text-white",
);

// 优化直接打开独立弹窗；检查问题仍由原有一键调整入口处理。
const startAiAction = () => {
  if (isGenerating.value) return;
  // 存在检查问题时先调整，全部通过后再进入内容优化
  openOneKeyIntro(needsAdjustment.value ? "oneKeyAdjust" : "oneKeyOptimize");
};

// 入口提示：格式错误 > 时间线问题 > 查看详情
const tooltipText = computed(() => {
  if (progressData.value.hasError) return $t("formatIssues");
  return issueCounts.value.timeline
    ? $t("timelineIssue", { count: issueCounts.value.timeline /* 时间问题数量 */ })
    : $t("viewProgressDetail");
});

// 点击前核对仍属于当前检查结果，切换简历或删除问题记录后不使用旧目标。
const goFill = (issue) => {
  if (!progressData.value.issues.includes(issue)) return;
  if (jumpToCheckTarget(issue.target)) visible.value = false;
};

</script>

<template>
  <!-- 操作按钮放在圆环旁，检查摘要下沉到原按钮所在的整行区域。 -->
  <div class="mb-1.5 flex w-full shrink-0 flex-col gap-1 border-b border-sf-b pb-1.5">
    <div class="flex items-center gap-1 group-[.module-tree-compact]/module-tree:flex-col">
      <SfTooltip :content="tooltipText" placement="right" class="block shrink-0">
        <button
          type="button"
          class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-sf-bg"
          :aria-label="$t('progressDetail')"
          @click="visible = true"
        >
          <svg class="h-8 w-8 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
            <circle
              cx="24"
              cy="24"
              r="19"
              fill="none"
              stroke="currentColor"
              class="text-sf-bg-2"
              stroke-width="6"
            />
            <circle
              cx="24"
              cy="24"
              r="19"
              fill="none"
              stroke="currentColor"
              stroke-width="6"
              stroke-linecap="round"
              stroke-dasharray="119.38"
              :class="needsAdjustment ? 'text-sf-warning' : 'text-sf-success'"
              :stroke-dashoffset="119.38 - (119.38 * Math.round(animatedProgress)) / 100"
            />
          </svg>
          <span class="absolute inset-0 grid place-content-center text-[10px] font-bold text-sf-text">
            {{ Math.round(animatedProgress) }}
          </span>
        </button>
      </SfTooltip>
      <button
        type="button"
        class="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-3xl px-1 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 group-[.module-tree-compact]/module-tree:w-8 group-[.module-tree-compact]/module-tree:flex-none group-[.module-tree-compact]/module-tree:px-0"
        :class="aiActionClass"
        :disabled="isGenerating"
        @click="startAiAction"
      >
        <SfIcon :icon="isGenerating ? 'line-md:loading-twotone-loop' : 'lucide:sparkles'" size="3" />
        <span class="truncate group-[.module-tree-compact]/module-tree:hidden">{{ aiActionLabel }}</span>
      </button>
    </div>
    <!-- 完成时隐藏状态文字，仅展示待处理问题 -->
    <button
      v-if="needsAdjustment"
      type="button"
      class="flex w-full cursor-pointer flex-col rounded-2xl px-2 text-left text-[10px] leading-4 text-sf-warning transition-colors group-[.module-tree-compact]/module-tree:hidden"
      :aria-label="$t('progressDetail')"
      @click="visible = true"
    >
      <span v-for="summary in issueSummary" :key="summary">{{ summary }}</span>
    </button>
  </div>

  <SfModal v-model="visible" :title="$t('progressDetail')" width="560px" title-class="justify-start! text-base!">
    <div class="flex flex-col gap-3">
      <p class="text-xs leading-5 text-sf-text-3">{{ $t("atsScoreDisclaimer") }}</p>
      <!-- 弹窗负责横向留白，模块用分隔线组织，避免卡片和底色逐层叠加。 -->
      <SfScrollbar max-height="60vh" flush view-class="divide-y divide-sf-b" class="h-auto! flex-none!">
        <section v-for="item in progressData.list" :key="item.key" class="shrink-0 py-3 first:pt-0 last:pb-0">
          <header class="flex items-center gap-3 px-3">
            <h3 class="min-w-0 flex-1 break-words text-sm font-medium text-sf-text">{{ item.name }}</h3>
            <span class="text-xs text-sf-text-3">{{ $t("writingWords", { count: resumeStats[item.key]?.total ?? 0 }) }}</span>
            <span class="text-xs tabular-nums text-sf-text-2">{{ item.progress }}%</span>
          </header>
          <!-- 问题行只提供边框反馈，去修改始终可见，换行后仍保持完整点击区域。 -->
          <button
            v-for="(issue, index) in item.issues"
            :key="index"
            type="button"
            class="flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg border border-transparent p-3 text-left text-xs leading-5 text-sf-text-2 transition-colors hover:border-sf-b focus-visible:border-sf-theme focus-visible:outline-none"
            @click="goFill(issue)"
          >
            <span class="min-w-0 break-words">{{ formatResumeCheckIssue(issue) }}</span>
            <span class="shrink-0 text-sf-theme">{{ $t("modify") }}</span>
          </button>
        </section>
      </SfScrollbar>
    </div>
  </SfModal>

  <OneKeyIntro v-model="introVisible" @confirm="confirmOneKeyIntro" />
</template>
