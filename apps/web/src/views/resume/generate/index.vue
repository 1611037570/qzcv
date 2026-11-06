<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useResumeStore } from "@/stores";
import { trackResumeAction } from "@/hooks";
import { $t } from "@/locales";
import AiGenerateFlow from "@/views/resume/components/aiGenerate/aiGenerateFlow.vue";
import type { AiGenerateFlowHandle } from "@/views/resume/components/aiGenerate/useAiResumeDraft";
import { useResumeCapacity } from "../hooks/useResumeCapacity";
import CapacityNotice from "../components/aiTask/capacityNotice.vue";

const resumeStore = useResumeStore();
const flow = ref<AiGenerateFlowHandle | null>(null);
const { remainingSlots } = useResumeCapacity();
const ready = ref(false);

// 页面常驻，进入即准备一轮空白生成：不预设模板，由流程组件展示输入表单。
// 数量允许时才进入生成流程；后续容量变化保留已准备的输入与候选。
watch(remainingSlots, async (count) => {
  if (count <= 0 || ready.value) return;
  ready.value = true;
  await nextTick();
  flow.value?.start({});
}, { immediate: true });

// 确认结果后沿用其他入口的创建与统计流程，addResume 会进入编辑器。
const handleConfirm = (item: Record<string, any>) => {
  if (!resumeStore.addResume(item)) return;
  trackResumeAction({ eventType: "create", fileType: "none" });
  flow.value?.reset();
};
</script>

<template>
  <main class="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden bg-sf-page p-3 text-sf-text">
      <header>
        <h1 class="text-lg font-semibold text-sf-text">{{ $t("resumeGeneratePageTitle") }}</h1>
        <p class="mt-[6px] max-w-3xl text-xs leading-6 text-sf-text-2">
          {{ $t("resumeGeneratePageDescription") }}
        </p>
      </header>
      <CapacityNotice v-if="!ready" />
      <!-- 生成流程与其他入口共用同一组件，页面只提供画布高度与创建简历的动作。 -->
      <section v-if="ready" class="min-h-0 flex-1 overflow-hidden rounded-xl border border-sf-b bg-sf-primary p-3">
        <AiGenerateFlow ref="flow" @confirm="handleConfirm" />
      </section>
  </main>
</template>
