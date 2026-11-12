<script setup>
import { computed } from "vue";
import { $t } from "@/locales";

const props = defineProps({
  report: { type: Object, required: true },
});

// 本轮改动按模块合并：同一模块的多次写入只占一行
const changeRows = computed(() => {
  const rows = new Map();
  (props.report.changes || []).forEach((item) => {
    const module = item?.module;
    if (!module) return;
    const summaries = rows.get(module) || [];
    if (item.summary && !summaries.includes(item.summary)) summaries.push(item.summary);
    rows.set(module, summaries);
  });
  return [...rows].map(([module, summaries]) => ({ module, summary: summaries.join("；") }));
});

// 总分评级
const level = computed(() => {
  const s = props.report.totalScore;
  // 没有可靠维度时显示未评分，不按零分评级
  if (s == null) return $t("aiChat_scoreUnavailable");
  if (s >= 90) return $t("aiChat_scoreExcellent");
  if (s >= 80) return $t("aiChat_scoreGood");
  if (s >= 70) return $t("aiChat_scoreMedium");
  if (s >= 60) return $t("aiChat_scorePass");
  return $t("aiChat_scoreImprove");
});
</script>

<template>
  <div class="w-full max-w-full overflow-hidden rounded-3xl border border-sf-b bg-sf-bg p-3">
    <div class="text-center">
      <h2 class="text-lg font-bold text-sf-text">{{ $t("aiChat_reportTitle") }}</h2>
      <p class="mt-3 text-[13px] text-sf-text-2">{{ $t("aiChat_reportSubtitle") }}</p>
    </div>
    <!-- 综合评分 -->
    <div class="mt-3 flex flex-col items-center justify-center gap-3 py-3">
      <span class="text-[40px] font-black leading-none text-sf-theme">{{ report.totalScore ?? "—" }}</span>
      <span class="text-[13px] text-sf-text-2">{{ $t("aiChat_overallScore") }} · {{ level }}</span>
    </div>

    <!-- 分维度得分 -->
    <div class="mt-6 flex flex-col gap-3">
      <div v-for="d in report.dimensions" :key="d.name" class="flex items-center gap-3">
        <span class="w-20 shrink-0 text-[13px] text-sf-text-2">{{ d.name }}</span>
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-sf-bg-2">
          <div
            class="h-full rounded-full bg-sf-theme"
            :style="{ width: (typeof d.score === 'number' ? d.score : 0) + '%' }"
          />
        </div>
        <span class="w-12 shrink-0 text-right text-[13px] font-medium text-sf-text">
          {{ d.score ?? $t("aiChat_notApplicable") }}
        </span>
      </div>
    </div>

    <!-- 体检问题清单 -->
    <div v-if="report.checks?.length" class="mt-6">
      <div class="mb-3 text-[14px] font-medium text-sf-text">{{ $t("aiChat_diagnosis") }}</div>
      <div class="flex flex-col gap-3">
        <div v-for="(c, i) in report.checks" :key="i" class="flex items-center gap-3">
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ background: c.level === 'error' ? '#ef4444' : '#f59e0b' }"
          />
          <span class="text-[13px] leading-relaxed text-sf-text">{{ c.message }}</span>
        </div>
      </div>
    </div>

    <!-- 本次改动：按模块汇总成一张表，同一模块只出现一次 -->
    <div v-if="changeRows.length" class="mt-6">
      <div class="mb-3 text-[14px] font-medium text-sf-text">{{ $t("aiChat_changeOverview") }}</div>
      <table class="w-full table-fixed border-collapse text-[13px]">
        <thead>
          <tr class="text-sf-text-2">
            <th class="w-24 border-b border-sf-b py-3 text-left font-normal">{{ $t("aiChat_moduleLabel") }}</th>
            <th class="border-b border-sf-b py-3 text-left font-normal">{{ $t("aiChat_changeScope") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in changeRows" :key="row.module">
            <td class="border-b border-sf-b py-3 pr-3 align-top text-sf-text-2">{{ row.module }}</td>
            <td class="border-b border-sf-b py-3 align-top leading-relaxed text-sf-text">{{ row.summary }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 下一步建议 -->
    <div v-if="report.suggestions?.length" class="mt-6">
      <div class="mb-3 text-[14px] font-medium text-sf-text">{{ $t("aiChat_nextSteps") }}</div>
      <div class="flex flex-col gap-3">
        <div v-for="(s, i) in report.suggestions" :key="i" class="flex items-start gap-3">
          <span class="text-[13px] leading-relaxed text-sf-theme">{{ i + 1 }}.</span>
          <span class="text-[13px] leading-relaxed text-sf-text">{{ s }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
