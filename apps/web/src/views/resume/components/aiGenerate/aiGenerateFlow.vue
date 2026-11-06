<script setup lang="ts">
import { computed } from "vue";
import { $t } from "@/locales";
import ResumePreview from "../aiOptimize/resumePreview.vue";
import CapacityNotice from "../aiTask/capacityNotice.vue";
import TaskStatus from "../aiTask/taskStatus.vue";
import { useAiResumeDraft } from "./useAiResumeDraft";
import { WORK_YEAR_OPTIONS } from "./workYears";
import { useResumeCapacity } from "../../hooks/useResumeCapacity";

defineOptions({ name: "AiGenerateFlow" });
const { remainingSlots, ensureCapacity } = useResumeCapacity();

const emit = defineEmits<{
  // 用户确认预览结果后交出已经套用入口样式的简历数据。
  confirm: [item: Record<string, any>];
}>();

const {
  generating,
  generationStage,
  pendingItem,
  generationWarnings,
  generationInput,
  start,
  generate,
  cancel,
  backToInput,
  reset,
} = useAiResumeDraft();

// 结果存在时入口需要更宽的画布展示预览。
const hasResult = computed(() => !!pendingItem.value);
const generationStatus = computed(() => $t(`resumeAiGenerateStage_${generationStage.value}`));

// 工作年限固定从选项中选择，展示文案跟随当前语言。
const workYearOptions = computed(() =>
  WORK_YEAR_OPTIONS.map((option) => ({
    value: option.value, // 选中后写入生成资料的年限文本。
    name: $t(option.labelKey, option.params ?? {}), // 下拉里展示的年限文案。
  })),
);

// 预览确认后才由入口创建简历并跳转，生成阶段不修改用户数据。
const confirmGenerated = () => {
  if (!pendingItem.value || !ensureCapacity()) return;
  emit("confirm", pendingItem.value);
};

// 入口通过 start 带入本次来源样式与预填资料，页面与弹窗共用同一入口。
defineExpose({ start, reset, hasResult });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 text-sf-text">
    <CapacityNotice />
    <TaskStatus v-if="generating" :title="generationStatus" :description="$t('resumeAiGenerateWorkingTitle')">
      <SfButton type="bg" @click="cancel">{{ $t('resumeAiGenerateCancel') }}</SfButton>
    </TaskStatus>
    <template v-else-if="pendingItem">
      <header class="shrink-0">
        <h2 class="text-sm font-semibold">{{ $t('resumeAiGenerateResultTitle') }}</h2>
        <p class="mt-3 text-xs leading-6 text-sf-text-2">{{ $t('resumeAiGenerateResultDescription') }}</p>
      </header>
      <section class="min-h-0 flex-1 overflow-hidden rounded-xl border border-sf-b">
        <ResumePreview :item="pendingItem" />
      </section>
      <SfScrollbar v-if="generationWarnings.length" flush height="96px" class="max-h-24 min-h-0 flex-none!">
        <ul class="space-y-3 text-xs leading-6 text-sf-warning"><li v-for="(warning, index) in generationWarnings" :key="index">{{ warning }}</li></ul>
      </SfScrollbar>
      <footer class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sf-b pt-3">
        <div class="flex flex-wrap gap-3">
          <SfButton type="bg" @click="backToInput">{{ $t('resumeAiGenerateBackToEdit') }}</SfButton>
          <SfButton type="bg" :disabled="!remainingSlots" @click="generate">{{ $t('resumeAiGenerateAgain') }}</SfButton>
        </div>
        <SfButton icon="lucide:check" :disabled="!remainingSlots" @click="confirmGenerated">{{ $t('resumeAiGenerateUseResult') }}</SfButton>
      </footer>
    </template>
    <template v-else>
      <SfScrollbar flush class="min-h-0 flex-1">
        <!-- 表单使用与模型接入一致的紧凑控件和主题底色。 -->
        <form class="generate-fields grid gap-3 sm:grid-cols-2" @submit.prevent="generate">
          <p class="rounded-xl bg-sf-theme-3 p-3 text-xs leading-6 text-sf-text-2 sm:col-span-2">{{ $t('resumeAiGenerateInputDescription') }}</p>
          <label class="flex min-w-0 flex-col gap-[6px] text-xs font-medium">
            {{ $t('resumeAiGeneratePositionTitle') }}
            <SfInput v-model="generationInput.position" :placeholder="$t('resumeAiGeneratePositionPlaceholder')" />
          </label>
          <label class="flex min-w-0 flex-col gap-[6px] text-xs font-medium">
            {{ $t('resumeAiGenerateWorkYearsTitle') }}
            <SfSelect v-model="generationInput.workYears" :list="workYearOptions" :placeholder="$t('resumeAiGenerateWorkYearsPlaceholder')" />
          </label>
          <label class="flex min-w-0 flex-col gap-[6px] text-xs font-medium sm:col-span-2">
            {{ $t('resumeAiGenerateSupplementTitle') }}
            <SfInput v-model="generationInput.supplement" type="textarea" :rows="7" resize="none" :placeholder="$t('resumeAiGenerateSupplementPlaceholder')" />
          </label>
        </form>
      </SfScrollbar>
      <footer class="flex shrink-0 justify-end gap-3 border-t border-sf-b pt-3">
        <SfButton icon="lucide:wand-sparkles" :disabled="!remainingSlots" @click="generate">{{ $t('resumeAiGenerateAction') }}</SfButton>
      </footer>
    </template>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

/* 输入控件沿用模型接入区的边框与主题底色。 */
.generate-fields :deep(.el-input__wrapper),
.generate-fields :deep(.el-select__wrapper),
.generate-fields :deep(.el-textarea__inner) {
  @apply rounded-xl border border-sf-b bg-sf-bg text-sf-text shadow-none;
}
.generate-fields :deep(.el-input__wrapper),
.generate-fields :deep(.el-select__wrapper) {
  @apply min-h-9;
}
.generate-fields :deep(.el-input__wrapper:hover),
.generate-fields :deep(.el-select__wrapper:hover),
.generate-fields :deep(.el-textarea__inner:hover) {
  @apply border-sf-theme;
}
</style>
