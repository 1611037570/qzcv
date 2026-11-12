<script setup lang="ts">
import { computed } from "vue";
import { RESUME_SCORE_DIMENSIONS, type ResumeReport } from "@snowflake/resume-agent";
import { $t } from "@/locales";

const props = defineProps<{
  report: ResumeReport; // 根据实际草稿差异整理的报告。
  incomplete: boolean; // 部分草稿不能展示为整份优化成功。
}>();

// 总分只做粗略归纳，阈值按百分制四档划分，不参与任何筛选判断。
const grade = computed(() => {
  const score = props.report.totalScore;
  if (score == null) return "";
  if (score >= 85) return $t("aiOptimize_gradeStrong");
  if (score >= 70) return $t("aiOptimize_gradeSolid");
  if (score >= 55) return $t("aiOptimize_gradeGaps");
  return $t("aiOptimize_gradeRewrite");
});

// 环形进度按周长换算，半径固定避免不同分数跳动。
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ringDash = computed(() => {
  const score = props.report.totalScore ?? 0;
  return `${(score / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
});

// 雷达图按百分制半径等比换算，六轴从正上方开始均匀分布。
const RADAR_CENTER = 110;
const RADAR_RADIUS = 78;
const RADAR_LEVELS = [0.25, 0.5, 0.75, 1];
const radarPoint = (index: number, ratio: number) => {
  const angle = ((index * 60 - 90) * Math.PI) / 180;
  return {
    x: Number((RADAR_CENTER + RADAR_RADIUS * ratio * Math.cos(angle)).toFixed(1)),
    y: Number((RADAR_CENTER + RADAR_RADIUS * ratio * Math.sin(angle)).toFixed(1)),
  };
};
// 缺分维度会把形状拉向圆心造成误读，六维齐全时才画雷达图。
const scoredDimensions = computed(() => props.incomplete ? [] : props.report.dimensions.filter((item) => item.score != null));
const hasScore = computed(() => !props.incomplete && props.report.totalScore != null && scoredDimensions.value.length > 0);
const allScored = computed(() => scoredDimensions.value.length === RESUME_SCORE_DIMENSIONS.length);
const radarRings = computed(() => RADAR_LEVELS.map((level) =>
  RESUME_SCORE_DIMENSIONS.map((_, index) => radarPoint(index, level)).map((point) => `${point.x},${point.y}`).join(" ")));
// 六条轴线固定按满分半径绘制，不随分数变化。
const radarAxes = computed(() => RESUME_SCORE_DIMENSIONS.map((_, index) => radarPoint(index, 1)));
const radarShape = computed(() => props.report.dimensions.map((item, index) => radarPoint(index, (item.score ?? 0) / 100)));
const radarPolygon = computed(() => radarShape.value.map((point) => `${point.x},${point.y}`).join(" "));
</script>

<template>
  <article class="flex flex-col gap-3 text-sf-text">
    <!-- 报告使用本地组件呈现，模型只提供数据，不控制布局或生成 HTML。 -->
    <header class="flex flex-wrap items-start gap-3 rounded-2xl border border-sf-b bg-sf-bg p-3">
      <div v-if="hasScore" class="relative flex h-24 w-24 shrink-0 items-center justify-center">
        <svg viewBox="0 0 100 100" class="h-24 w-24 -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" :r="RING_RADIUS" fill="none" stroke-width="8" class="stroke-sf-bg-2" />
          <circle cx="50" cy="50" :r="RING_RADIUS" fill="none" stroke-width="8" stroke-linecap="round" :stroke-dasharray="ringDash" class="stroke-sf-theme" />
        </svg>
        <div class="absolute flex flex-col items-center">
          <strong class="text-2xl font-semibold">{{ report.totalScore }}</strong>
          <span class="text-xs text-sf-text-3">{{ $t("aiChat_overallScore") }}</span>
        </div>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-base font-semibold">{{ incomplete ? $t('aiOptimize_partialReportTitle') : $t('aiOptimize_reportTitle') }}</h2>
          <span v-if="hasScore && grade" class="rounded-full bg-sf-theme-3 px-3 py-1 text-xs text-sf-theme">{{ grade }}</span>
        </div>
        <p class="text-sm leading-6 text-sf-text-2">{{ report.summary }}</p>
        <div class="flex flex-wrap items-center gap-3 text-xs text-sf-text-3">
          <span class="rounded-full bg-sf-primary px-3 py-1">{{ $t("aiOptimize_changeCount", { count: report.changes.length }) }}</span>
          <span class="rounded-full bg-sf-primary px-3 py-1">{{ $t("aiOptimize_todoCount", { count: report.todo.length }) }}</span>
          <span class="rounded-full bg-sf-primary px-3 py-1">{{ $t("aiOptimize_checkCount", { count: report.checks.length }) }}</span>
        </div>
        <p class="flex items-center gap-3 text-xs leading-6" :class="incomplete ? 'text-sf-warning' : 'text-sf-text-3'">
          <SfIcon :icon="incomplete ? 'lucide:triangle-alert' : 'lucide:file-text'" size="4" class="shrink-0" />
          {{ incomplete ? $t('aiOptimize_partialNote') : report.changes.length ? $t('aiOptimize_draftNote') : $t('aiOptimize_noChangeNote') }}
        </p>
      </div>
    </header>

    <section v-if="scoredDimensions.length" class="flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-sm font-semibold">{{ $t("aiOptimize_dimensionsTitle") }}</h3>
        <span class="text-xs text-sf-text-3">{{ $t("aiOptimize_dimensionsNote") }}</span>
      </div>
      <div class="grid items-center gap-3" :class="allScored ? 'md:grid-cols-2' : ''">
        <div v-if="allScored" class="flex items-center justify-center rounded-xl bg-sf-bg p-3">
          <svg viewBox="0 0 220 220" class="h-54 w-54" role="img" :aria-label="$t('aiOptimize_radarAria')">
            <polygon v-for="(ring, index) in radarRings" :key="index" :points="ring" fill="none" stroke-width="1" class="stroke-sf-b" />
            <line v-for="(axis, index) in radarAxes" :key="index" :x1="RADAR_CENTER" :y1="RADAR_CENTER" :x2="axis.x" :y2="axis.y" stroke-width="1" class="stroke-sf-b" />
            <polygon :points="radarPolygon" stroke-width="2" class="fill-sf-theme-3 stroke-sf-theme" />
            <circle v-for="(point, index) in radarShape" :key="index" :cx="point.x" :cy="point.y" r="3" class="fill-sf-theme" />
          </svg>
        </div>
        <div class="flex flex-col gap-3">
          <div v-for="dimension in scoredDimensions" :key="dimension.name" class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3 text-xs">
              <span class="text-sf-text-2">{{ dimension.name }}</span>
              <strong class="text-sm font-semibold" :class="dimension.score == null ? 'text-sf-text-3' : ''">{{ dimension.score ?? $t('aiChat_notApplicable') }}</strong>
            </div>
            <div class="h-[6px] overflow-hidden rounded-full bg-sf-bg-2"><div class="h-full rounded-full bg-sf-theme" :style="{ width: `${dimension.score ?? 0}%` }" /></div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="report.changes.length" class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold">{{ $t("aiOptimize_changesTitle", { count: report.changes.length }) }}</h3>
      <div class="grid gap-3 md:grid-cols-2">
        <article v-for="change in report.changes" :key="change.module" class="flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3">
          <div class="flex items-center justify-between gap-3">
            <h4 class="text-sm font-medium">{{ change.module }}</h4>
            <span class="rounded-full bg-sf-success-2 px-3 py-1 text-xs text-sf-success">{{ $t("aiOptimize_rewritten") }}</span>
          </div>
          <p v-if="change.problem" class="rounded-xl bg-sf-bg p-3 text-xs leading-6 text-sf-text-2"><span class="text-sf-text-3">{{ $t("aiOptimize_originalProblem") }}</span>{{ change.problem }}</p>
          <p class="text-sm leading-6">{{ change.summary }}</p>
          <!-- 默认报告只展示结果说明，原文和改后内容统一在“查看对比”中查看。 -->
          <p v-if="change.benefit" class="border-l-2 border-sf-theme pl-3 text-xs leading-6 text-sf-theme">{{ change.benefit }}</p>
        </article>
      </div>
    </section>

    <section v-if="report.highlights.length" class="rounded-xl bg-sf-theme-3 p-3">
      <h3 class="flex items-center gap-3 text-sm font-semibold text-sf-theme"><SfIcon icon="lucide:sparkles" size="4" />{{ $t("aiOptimize_highlightsTitle") }}</h3>
      <ul class="mt-3 flex flex-col gap-3 text-sm leading-6"><li v-for="item in report.highlights" :key="item">{{ item }}</li></ul>
    </section>

    <section v-if="report.checks.length" class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold">{{ $t("aiOptimize_checksTitle") }}</h3>
      <ul class="grid gap-3 md:grid-cols-2">
        <li v-for="(check, index) in report.checks" :key="index" class="flex items-start gap-3 rounded-xl border border-sf-b bg-sf-primary p-3 text-sm leading-6">
          <SfIcon :icon="check.level === 'error' ? 'lucide:circle-alert' : 'lucide:triangle-alert'" size="5" class="mt-[3px] shrink-0" :class="check.level === 'error' ? 'text-sf-error' : 'text-sf-warning'" />
          <span>{{ check.message }}</span>
        </li>
      </ul>
    </section>

    <div v-if="report.todo.length || report.suggestions.length" class="grid gap-3 md:grid-cols-2">
      <section v-if="report.todo.length" class="flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3">
        <h3 class="text-sm font-semibold">{{ $t("aiOptimize_todoTitle") }}</h3>
        <ul class="flex flex-col gap-3">
          <li v-for="(item, index) in report.todo" :key="index" class="flex items-start gap-3 text-sm leading-6 text-sf-text-2"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sf-warning-2 text-xs text-sf-warning">{{ index + 1 }}</span>{{ item }}</li>
        </ul>
      </section>
      <section v-if="report.suggestions.length" class="flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3">
        <h3 class="text-sm font-semibold">{{ $t("aiOptimize_suggestionsTitle") }}</h3>
        <ul class="flex flex-col gap-3">
          <li v-for="(item, index) in report.suggestions" :key="index" class="flex items-start gap-3 text-sm leading-6 text-sf-text-2"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sf-theme-3 text-xs text-sf-theme">{{ index + 1 }}</span>{{ item }}</li>
        </ul>
      </section>
    </div>
  </article>
</template>
