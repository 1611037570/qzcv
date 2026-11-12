<script setup>
import { computed } from "vue";
import { useClipboard } from "@vueuse/core";
import { ElMessage } from "element-plus";
import { $t } from "@/locales";

const props = defineProps({
  // 本轮 Agent 运行观测数据
  run: {
    type: Object,
    required: true,
  },
});

const { copy, isSupported } = useClipboard();

// 任务契约：规划缺失时可能只有隐式任务或没有任务
const task = computed(() => props.run.task || null);
// 证据条数用于快速判断这轮到底执行了几次工具
const stepCount = computed(() => props.run.steps?.length || 0);
// 被拦截的完成校验次数
const blockedCount = computed(
  () => (props.run.verdicts || []).filter((item) => !item.completed).length,
);
// 导出用完整快照，包含任务契约与全部证据
const snapshot = computed(() => JSON.stringify(props.run, null, 2));

// 复制排障快照，方便贴给开发定位
const copySnapshot = async () => {
  if (!isSupported.value) {
    ElMessage.error($t("aiChat_copyUnsupported"));
    return;
  }
  await copy(snapshot.value);
  ElMessage.success($t("aiChat_runCopied"));
};
</script>

<template>
  <section class="mt-3 w-full rounded-xl border border-sf-b bg-sf-bg-2 p-3 text-[12px] text-sf-text-2">
    <!-- 概览：一轮请求的关键指标 -->
    <div class="flex flex-wrap items-center gap-3">
      <span>{{ $t("aiChat_runEntry") }} {{ run.source }}</span>
      <span>{{ $t("aiChat_runDuration", { time: ((run.durationMs || 0) / 1000).toFixed(1) }) }}</span>
      <span v-if="run.tokens">{{ $t("aiChat_runTokens", { tokens: run.tokens }) }}</span>
      <span>{{ $t("aiChat_runToolCount", { count: stepCount }) }}</span>
      <span v-if="blockedCount">{{ $t("aiChat_runBlocked", { count: blockedCount }) }}</span>
      <button
        type="button"
        class="ml-auto rounded-lg border border-sf-b px-3 py-1 text-sf-theme hover:bg-sf-theme-2"
        @click="copySnapshot"
      >
        {{ $t("aiChat_copyDetails") }}
      </button>
    </div>

    <!-- 降级说明：正常情况下不应出现 -->
    <p v-if="run.note" class="mt-3 text-sf-error">{{ run.note }}</p>

    <!-- 任务契约 -->
    <div v-if="task" class="mt-3 grid grid-cols-2 gap-3">
      <div>
        <span class="text-sf-text-3">{{ $t("aiChat_taskObjective") }}</span>
        <p class="text-sf-text">{{ task.objective }}</p>
      </div>
      <div>
        <span class="text-sf-text-3">{{ $t("aiChat_taskScope") }}</span>
        <p class="text-sf-text">{{ task.scope }}</p>
      </div>
      <div>
        <span class="text-sf-text-3">{{ $t("aiChat_taskEffects") }}</span>
        <p class="text-sf-text">{{ task.requiredEffects?.join("、") || $t("aiChat_none") }}</p>
      </div>
      <div>
        <span class="text-sf-text-3">{{ $t("aiChat_taskConditions") }}</span>
        <p class="text-sf-text">{{ task.successCondition }}</p>
      </div>
      <div>
        <span class="text-sf-text-3">{{ $t("aiChat_taskPhase") }}</span>
        <p class="text-sf-text">{{ task.phase }}</p>
      </div>
      <div>
        <span class="text-sf-text-3">{{ $t("aiChat_taskCapability") }}</span>
        <p class="text-sf-text">{{ task.capabilityIds?.join("、") || $t("aiChat_none") }}</p>
      </div>
    </div>

    <!-- 工具证据时间线 -->
    <div v-if="stepCount" class="mt-3">
      <span class="text-sf-text-3">{{ $t("aiChat_toolEvidence") }}</span>
      <ul class="mt-1 space-y-1">
        <li v-for="step in run.steps" :key="`${step.sequence}-${step.tool}`" class="flex gap-3">
          <span class="w-6 shrink-0 text-right text-sf-text-3">{{ step.sequence }}</span>
          <span class="w-40 shrink-0 text-sf-text">{{ step.tool }}</span>
          <span class="w-16 shrink-0" :class="step.status === 'success' ? '' : 'text-sf-error'">
            {{ step.status }}
          </span>
          <span class="min-w-0 flex-1">
            {{ step.summary }}<template v-if="step.replayed">{{ $t("aiChat_stepReplayed") }}</template>
          </span>
        </li>
      </ul>
    </div>

    <!-- 完成校验：记录每次被拦截的原因 -->
    <div v-if="run.verdicts?.length" class="mt-3">
      <span class="text-sf-text-3">{{ $t("aiChat_verdicts") }}</span>
      <ul class="mt-1 space-y-1">
        <li v-for="(verdict, index) in run.verdicts" :key="index">
          {{ verdict.completed ? $t("aiChat_verdictPass") : $t("aiChat_verdictBlocked") }}
          <template v-if="verdict.reason">：{{ verdict.reason }}</template>
        </li>
      </ul>
    </div>
  </section>
</template>
