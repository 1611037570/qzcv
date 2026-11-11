<script setup>
// 完成度入口：挂在模块树顶部，显示总进度并可打开完成度详情
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { TransitionPresets, useTransition } from "@vueuse/core";
import { useResumeStore } from "@/stores";
import { editorProgress, jumpAll, jumpToCheckTarget } from "../../../../hooks/useModuleNav";
import { formatResumeCheckIssue } from "../../../../hooks/resumeChecks";
import { useResumeStats } from "../../../../hooks/useResumeStats";
import { $t } from "@/locales";
import eventBus from "@/utils/modules/eventBus";
import OneKeyIntro from "../../../../components/oneKeyIntro.vue";
import { useOneKeyActions } from "../../../../hooks/useOneKeyActions";

const resumeStore = useResumeStore();
const { currentData, currentUI, isGenerating } = storeToRefs(resumeStore);

// 抽屉形态下跳转后通知外层收起抽屉并切回编辑面板
const emit = defineEmits(["navigate"]);

// 优化交给独立弹窗，调整仍在确认说明后启动助手流程。
const { introVisible, openOneKeyIntro, confirmOneKeyIntro } = useOneKeyActions(
  (flow) => eventBus.emit("resume-start-assistant-flow", flow),
);

// 详情弹窗显隐
const visible = ref(false);
// 打开详情：卡片点击与模块树「待补充」提示（事件总线）共用同一入口
const openDetail = () => {
  visible.value = true;
};
onMounted(() => eventBus.on("open-progress-detail", openDetail));
onUnmounted(() => eventBus.off("open-progress-detail", openDetail));

// 总进度与各模块进度（含时间线一致性检查结果）使用编辑器共享计算，模块树勾选与这里消费同一份数据
const progressData = editorProgress;
// 保留数据引用，切换简历及撤销替换数据后重新统计当前内容
const resumeStats = useResumeStats(computed(() => currentData.value || {}), currentUI);

// 总进度数字过渡动画
const animatedProgress = useTransition(computed(() => progressData.value.progress), {
  duration: 500,
  transition: TransitionPresets.easeOutCubic,
});
// 界面统一消费取整后的百分比，避免多处重复取整
const displayProgress = computed(() => Math.round(animatedProgress.value));

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

// 点击前核对仍属于当前检查结果，切换简历或删除问题记录后不使用旧目标。
const goFill = (issue) => {
  if (!progressData.value.issues.includes(issue)) return;
  if (jumpToCheckTarget(issue.target)) {
    visible.value = false;
    emit("navigate");
  }
};

// 全部未填完的模块：卡片上的「还差」逐个展示，点击直接定位填写
const incompleteModules = computed(
  () => progressData.value.list.filter((item) => item.progress < 100),
);
// 还差模块跳转：编辑区与预览区同步定位，隐藏模块自动恢复
const goFillModule = (key) => {
  jumpAll(key);
  emit("navigate");
};

</script>

<template>
  <!-- 完成度区块：背景与模块树一致，一键调整收纳在区块内，点击空白处打开详情 -->
  <div class="mb-1.5 w-full shrink-0">
    <div
      class="cursor-pointer rounded-2xl border border-sf-b p-3 transition-colors hover:border-sf-theme"
      :aria-label="$t('progressDetail')"
      @click="openDetail"
    >
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-xs text-sf-text-3">{{ $t("completionRate") }}</span>
        <!-- chevron 提示整张卡片可点击查看详情 -->
        <span class="flex items-center gap-0.5 text-sm font-bold tabular-nums text-sf-text">
          {{ displayProgress }}%
          <SfIcon icon="mdi:chevron-right" size="3" class="font-normal text-sf-text-3" />
        </span>
      </div>
      <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sf-bg">
        <div
          class="h-full rounded-full transition-[width] duration-500"
          :class="needsAdjustment ? 'bg-sf-warning' : 'bg-sf-success'"
          :style="{ width: `${displayProgress}%` }"
        />
      </div>
      <!-- 还差：展示全部未填完的模块名，点击直接定位填写，不触发卡片打开详情 -->
      <div
        v-if="incompleteModules.length"
        class="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] leading-4"
        @click.stop
      >
        <span class="shrink-0 text-sf-text-3">{{ $t("progressRemainingPrefix") }}</span>
        <template v-for="(item, index) in incompleteModules" :key="item.key">
          <button
            type="button"
            class="min-w-0 max-w-full cursor-pointer truncate text-left text-sf-theme transition-colors hover:underline"
            @click="goFillModule(item.key)"
          >{{ item.name }}</button>
          <span
            v-if="index < incompleteModules.length - 1"
            class="shrink-0 text-sf-text-3"
          >{{ $t("enumSeparator") }}</span>
        </template>
      </div>
      <!-- 一键调整收纳在完成度区块内：阻止冒泡避免同时打开详情 -->
      <button
        type="button"
        class="mt-1.5 flex h-8 min-w-0 w-full cursor-pointer items-center justify-center gap-1 rounded-3xl px-1 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60"
        :class="aiActionClass"
        :disabled="isGenerating"
        @click.stop="startAiAction"
      >
        <SfIcon :icon="isGenerating ? 'line-md:loading-twotone-loop' : 'lucide:sparkles'" size="3" />
        <span class="truncate">{{ aiActionLabel }}</span>
      </button>
    </div>
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
