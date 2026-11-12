<script setup lang="ts">
import { computed, ref } from "vue";

import { $t } from "@/locales";

import {
  offerComparisonMetrics,
  type OfferComparisonMetric,
  type OfferMetricKey,
} from "./data";

type OfferValueStatus = "empty" | "value" | "unknown";
type MetricComparisonLevel = "advantage" | "close" | "middle" | "weak" | "pending" | "insufficient";

/** 单份 Offer 在一个维度下的填写状态。 */
interface OfferMetricEntry {
  /** 当前维度尚未填写、有值或不清楚。 */
  status: OfferValueStatus;
  /** 当前维度用于比较的数值。 */
  value: number | null;
}

/** 一家公司参与对比的完整数据。 */
interface OfferCompany {
  /** 公司数据的稳定标识。 */
  id: string;
  /** 用户填写的公司或 Offer 名称。 */
  name: string;
  /** 名称为空时使用的默认名称。 */
  fallbackName: string;
  /** 全部对比维度的填写状态。 */
  metrics: Record<OfferMetricKey, OfferMetricEntry>;
}

/** 单个维度的多公司比较结果。 */
interface MetricComparisonDetail {
  /** 当前比较的维度配置。 */
  metric: OfferComparisonMetric;
  /** 当前维度具备可比较信息的公司标识。 */
  knownCompanyIds: string[];
  /** 当前维度处于优势的公司标识。 */
  advantageCompanyIds: string[];
  /** 当前维度相对偏弱的公司标识。 */
  weakCompanyIds: string[];
}

/** 单家公司的综合结果。 */
interface CompanyComparisonResult {
  /** 对应的公司数据。 */
  company: OfferCompany;
  /** 按可比较维度折算的百分制得分。 */
  score: number;
  /** 实际参与该公司评分的内部权重。 */
  comparableWeight: number;
}

let companySequence = 0;

// 创建单家公司使用的空白维度数据。
function createMetricEntries() {
  return Object.fromEntries(
    offerComparisonMetrics.map((metric) => [metric.key, { status: "empty", value: null }]),
  ) as Record<OfferMetricKey, OfferMetricEntry>;
}

// 创建可动态增加的公司，默认名称按添加顺序生成。
function createCompany(): OfferCompany {
  companySequence += 1;
  const alphabeticalName = companySequence <= 26
    ? String.fromCharCode(64 + companySequence)
    : String(companySequence);
  return {
    id: `offer-${companySequence}`,
    name: "",
    fallbackName: `Offer ${alphabeticalName}`,
    metrics: createMetricEntries(),
  };
}

const companies = ref<OfferCompany[]>([createCompany(), createCompany()]);
const activeMetricIndex = ref(0);
const showResult = ref(false);

const activeMetric = computed(() => offerComparisonMetrics[activeMetricIndex.value]!);
const completedCount = computed(
  () => offerComparisonMetrics.filter((metric) => isMetricCompleted(metric.key)).length,
);
const isCompleted = computed(() => completedCount.value === offerComparisonMetrics.length);

// 统一取得公司展示名称，空名称使用创建时的默认名称。
function getCompanyName(company: OfferCompany) {
  return company.name.trim() || company.fallbackName;
}

// 判断一个维度的所有公司是否都已填写或标记信息状态。
function isMetricCompleted(metricKey: OfferMetricKey) {
  return companies.value.every((company) => company.metrics[metricKey].status !== "empty");
}

// 查找指定公司，供各类输入操作更新当前维度。
function getCompany(companyId: string) {
  return companies.value.find((company) => company.id === companyId);
}

// 更新数值项，清空输入时恢复未填写状态。
function setMetricValue(companyId: string, value: number | undefined) {
  const company = getCompany(companyId);
  if (!company) return;
  company.metrics[activeMetric.value.key] = {
    status: typeof value === "number" ? "value" : "empty",
    value: typeof value === "number" ? value : null,
  };
}

// 当前维度所有公司均完成选择后进入下一项，最后一项不再跳转。
function advanceAfterChoice() {
  if (
    isMetricCompleted(activeMetric.value.key) &&
    activeMetricIndex.value < offerComparisonMetrics.length - 1
  ) {
    activeMetricIndex.value += 1;
  }
}

// 更新单家公司选择，等待当前维度的其他公司也完成后再切换。
function selectMetricChoice(companyId: string, value: number) {
  const company = getCompany(companyId);
  if (!company) return;
  company.metrics[activeMetric.value.key] = { status: "value", value };
  advanceAfterChoice();
}

// 标记当前维度暂不清楚，供计分与待确认清单区分处理。
function setMetricStatus(companyId: string, status: "unknown") {
  const company = getCompany(companyId);
  if (!company) return;
  company.metrics[activeMetric.value.key] = { status, value: null };
  advanceAfterChoice();
}

// 切换当前对比维度，已填写内容继续保留。
function switchMetric(metricIndex: number) {
  activeMetricIndex.value = metricIndex;
}

// 增加一家公司后，所有维度需补充该公司的对应信息。
function addCompany() {
  companies.value.push(createCompany());
}

// 至少保留两家公司，移除后其填写数据不再参与对比。
function removeCompany(companyId: string) {
  if (companies.value.length <= 2) return;
  companies.value = companies.value.filter((company) => company.id !== companyId);
}

// 只有已填写的具体值参与比较，不清楚与未填写不参与比较。
function isComparableEntry(entry: OfferMetricEntry) {
  return entry.status === "value";
}

// 取得用于内部比较的数值。
function getComparableValue(entry: OfferMetricEntry) {
  return entry.value ?? 0;
}

// 比较两家公司在单个维度的优劣，一代表前者更好，负一代表后者更好。
function compareEntries(
  metric: OfferComparisonMetric,
  firstEntry: OfferMetricEntry,
  secondEntry: OfferMetricEntry,
) {
  const first = getComparableValue(firstEntry);
  const second = getComparableValue(secondEntry);
  if (first === second) return 0;

  if (metric.inputType === "number") {
    const comparisonBase = Math.max(Math.abs(first), Math.abs(second), 1);
    if (Math.abs(first - second) / comparisonBase <= 0.05) return 0;
  }

  const firstWins = metric.direction === "higher" ? first > second : first < second;
  return firstWins ? 1 : -1;
}

// 找出一个维度中最好或最弱的公司，接近的公司会同时保留。
function findBoundaryCompanies(
  metric: OfferComparisonMetric,
  knownCompanies: OfferCompany[],
  boundary: "best" | "weak",
) {
  if (!knownCompanies.length) return [];
  let boundaryCompanies = [knownCompanies[0]!];
  for (const company of knownCompanies.slice(1)) {
    const comparison = compareEntries(
      metric,
      company.metrics[metric.key],
      boundaryCompanies[0]!.metrics[metric.key],
    );
    const boundaryComparison = boundary === "best" ? comparison : -comparison;
    if (boundaryComparison > 0) boundaryCompanies = [company];
    else if (boundaryComparison === 0) boundaryCompanies.push(company);
  }
  return boundaryCompanies.map((company) => company.id);
}

const metricDetails = computed<MetricComparisonDetail[]>(() =>
  offerComparisonMetrics.map((metric) => {
    const knownCompanies = companies.value.filter((company) =>
      isComparableEntry(company.metrics[metric.key]),
    );
    const advantageCompanyIds = findBoundaryCompanies(metric, knownCompanies, "best");
    const weakCompanyIds = findBoundaryCompanies(metric, knownCompanies, "weak");
    const allClose = knownCompanies.length > 1 && advantageCompanyIds.length === knownCompanies.length;
    return {
      metric,
      knownCompanyIds: knownCompanies.map((company) => company.id),
      advantageCompanyIds: allClose ? [] : advantageCompanyIds,
      weakCompanyIds: allClose ? [] : weakCompanyIds,
    };
  }),
);

// 将单项填写值换算为零到一的得分比例。
function calculateMetricScoreRatio(metric: OfferComparisonMetric, value: number) {
  if (metric.inputType === "choice") {
    const maximumValue = Math.max(...(metric.options ?? []).map((option) => option.value), 1);
    return Math.min(Math.max(value / maximumValue, 0), 1);
  }

  const fullScoreThreshold = metric.fullScoreThreshold ?? 0;
  if (metric.direction === "higher") {
    if (fullScoreThreshold <= 0) return 0;
    return Math.min(Math.max(value / fullScoreThreshold, 0), 1);
  }

  if (value <= fullScoreThreshold) return 1;
  const maximumValue = metric.max ?? fullScoreThreshold;
  if (maximumValue <= fullScoreThreshold) return 0;
  return Math.min(Math.max((maximumValue - value) / (maximumValue - fullScoreThreshold), 0), 1);
}

// 按各项权重计算单家公司成绩，未知信息不参与并按已知权重折算。
function calculateCompanyResult(company: OfferCompany): CompanyComparisonResult {
  let weightedScore = 0;
  let comparableWeight = 0;

  for (const metric of offerComparisonMetrics) {
    const entry = company.metrics[metric.key];
    if (!isComparableEntry(entry)) continue;
    comparableWeight += metric.weight;
    weightedScore += metric.weight * calculateMetricScoreRatio(metric, entry.value ?? 0);
  }

  return {
    company,
    score: comparableWeight ? weightedScore / comparableWeight * 100 : 0,
    comparableWeight,
  };
}

const rankedCompanies = computed(() =>
  companies.value
    .map((company) => calculateCompanyResult(company))
    .sort((first, second) => second.score - first.score),
);
const resultTitle = computed(() => {
  const comparableResults = rankedCompanies.value.filter((result) => result.comparableWeight > 0);
  if (!comparableResults.length) return $t("tools_offerResultInsufficientInfo");
  if (comparableResults.length === 1) return $t("tools_offerResultSingleCompany");
  if (comparableResults[0]!.score - comparableResults[1]!.score < 5) {
    return $t("tools_offerResultTopClose");
  }
  return $t("tools_offerResultLeading", { name: getCompanyName(comparableResults[0]!.company) });
});

// 判断一家公司在指定维度中的对比状态。
function getMetricLevel(detail: MetricComparisonDetail, company: OfferCompany): MetricComparisonLevel {
  const entry = company.metrics[detail.metric.key];
  if (entry.status === "unknown") return "pending";
  if (!isComparableEntry(entry)) return "insufficient";
  if (detail.knownCompanyIds.length < 2) return "insufficient";
  if (!detail.advantageCompanyIds.length && !detail.weakCompanyIds.length) return "close";
  if (detail.advantageCompanyIds.includes(company.id)) return "advantage";
  if (detail.weakCompanyIds.includes(company.id)) return "weak";
  return "middle";
}

// 将内部对比状态转换为结果页可读文案。
function getMetricLevelLabel(detail: MetricComparisonDetail, company: OfferCompany) {
  const labelMap: Record<MetricComparisonLevel, string> = {
    advantage: $t("tools_offerLevelAdvantage"),
    close: $t("tools_offerLevelClose"),
    middle: $t("tools_offerLevelMiddle"),
    weak: $t("tools_offerLevelWeak"),
    pending: $t("tools_offerLevelPending"),
    insufficient: $t("tools_offerLevelInsufficient"),
  };
  return labelMap[getMetricLevel(detail, company)];
}

// 格式化结果表中的数值与未知状态。
function formatMetricValue(metric: OfferComparisonMetric, company: OfferCompany) {
  const entry = company.metrics[metric.key];
  if (entry.status === "unknown") return $t("tools_unknownChoice");
  if (entry.status !== "value" || entry.value === null) return $t("tools_offerNotFilled");
  if (metric.inputType === "choice") {
    return metric.options?.find((choice) => choice.value === entry.value)?.label ?? $t("tools_offerNotFilled");
  }
  return `${entry.value}${metric.unit ?? ""}`;
}

// 汇总单家公司的优势项。
function getCompanyAdvantages(company: OfferCompany) {
  return metricDetails.value
    .filter((detail) => getMetricLevel(detail, company) === "advantage")
    .map((detail) => detail.metric.title);
}

// 汇总单家公司的相对短板。
function getCompanyWeaknesses(company: OfferCompany) {
  return metricDetails.value
    .filter((detail) => getMetricLevel(detail, company) === "weak")
    .map((detail) => detail.metric.title);
}

// 汇总单家公司在签约前仍需确认的项目。
function getCompanyPendingMetrics(company: OfferCompany) {
  return offerComparisonMetrics
    .filter((metric) => company.metrics[metric.key].status === "unknown")
    .map((metric) => metric.title);
}

// 全部维度完成后由用户主动查看对比结果。
function viewComparisonResult() {
  if (isCompleted.value) showResult.value = true;
}

// 清空所有公司与维度数据，重新从两家公司开始对比。
function resetComparison() {
  companySequence = 0;
  companies.value = [createCompany(), createCompany()];
  activeMetricIndex.value = 0;
  showResult.value = false;
}

// 对比得分保留一位小数，并去掉整数末尾的小数点。
function formatScore(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
</script>

<template>
  <SfScrollbar class="h-full bg-sf-page" flush>
    <!-- 工作区内容撑满可用宽度，保留紧凑分组和选中反馈。 -->
    <main class="w-full p-3 text-sf-text">
      <nav :aria-label="$t('tools_breadcrumb')" class="text-xs text-sf-text-3">
        <RouterLink to="/resume/tools" class="transition-colors hover:text-sf-theme">
          {{ $t("tools_title") }}
        </RouterLink>
        <span class="px-3" aria-hidden="true">/</span>
        <span aria-current="page">{{ $t("tools_offerTitle") }}</span>
      </nav>

      <header v-if="!showResult" class="mt-3 mb-3">
        <h1 class="text-lg font-semibold">{{ $t("tools_offerTitle") }}</h1>
        <p class="mt-[6px] max-w-3xl text-xs leading-6 text-sf-text-2">
          {{ $t("tools_offerSubtitle") }}
        </p>
      </header>

      <section v-if="!showResult" class="mt-3 grid gap-3">
        <section class="rounded-xl border border-sf-b bg-sf-primary p-3">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-sm font-semibold">{{ $t("tools_offerCompaniesTitle") }}</h2>
            <SfButton :round="false" plain @click="addCompany">{{ $t("tools_offerAddCompany") }}</SfButton>
          </header>
          <ul class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <li
              v-for="company in companies"
              :key="company.id"
              class="rounded-lg bg-sf-bg p-3"
            >
              <header class="flex items-center justify-between gap-3">
                <span class="font-semibold">{{ company.fallbackName }}</span>
                <SfButton
                  :round="false"
                  v-if="companies.length > 2"
                  type="error"
                  plain
                  size="small"
                  @click="removeCompany(company.id)"
                >
                  {{ $t("tools_offerRemove") }}
                </SfButton>
              </header>
              <label class="mt-3 block text-sm font-semibold">
                {{ $t("tools_offerNameLabel") }}
                <SfInput
                  v-model="company.name"
                  :placeholder="$t('tools_offerNamePlaceholder', { name: company.fallbackName })"
                  class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
                />
              </label>
            </li>
          </ul>
        </section>

        <nav
          class="rounded-xl border border-sf-b bg-sf-primary p-3"
          :aria-label="$t('tools_offerProgressNav')"
        >
          <p class="text-xs font-medium text-sf-text-2">
            {{ $t("tools_progress", { current: activeMetricIndex + 1, total: offerComparisonMetrics.length, done: completedCount }) }}
          </p>
          <!-- 进度以完整填写的维度计算，不把单家公司已填误作整项完成。 -->
          <div class="mt-3 h-[3px] overflow-hidden rounded-full bg-sf-bg-2" role="progressbar" :aria-label="$t('tools_offerProgressBar')" :aria-valuenow="completedCount" :aria-valuemax="offerComparisonMetrics.length" :aria-valuemin="0">
            <div class="h-full rounded-full bg-sf-theme transition-[width] duration-300" :style="`width: ${completedCount / offerComparisonMetrics.length * 100}%`" />
          </div>
          <ol class="mt-3 grid grid-cols-5 gap-3 md:grid-cols-10">
            <li v-for="(metric, metricIndex) in offerComparisonMetrics" :key="metric.key">
              <button
                type="button"
                class="flex min-h-15 w-full cursor-pointer flex-col items-center justify-center gap-[6px] rounded-lg border px-[6px] py-[6px] text-sm transition-colors hover:border-sf-theme hover:bg-sf-bg"
                :class="activeMetricIndex === metricIndex
                  ? 'border-sf-theme bg-sf-theme-3 text-sf-theme'
                  : isMetricCompleted(metric.key)
                    ? 'border-sf-success bg-sf-success-2 text-sf-success'
                    : 'border-sf-b bg-sf-primary text-sf-text-2'"
                :aria-current="activeMetricIndex === metricIndex ? 'step' : undefined"
                :aria-label="`${metricIndex + 1}. ${metric.title}${isMetricCompleted(metric.key) ? $t('tools_completed') : $t('tools_uncompleted')}`"
                @click="switchMetric(metricIndex)"
              >
                <span class="font-medium tabular-nums">{{ metricIndex + 1 }}</span>
                <span class="w-full truncate text-[11px] leading-3">{{ metric.title }}</span>
              </button>
            </li>
          </ol>
        </nav>

        <fieldset
          :key="activeMetric.key"
          class="rounded-xl border border-sf-b bg-sf-primary p-3"
        >
          <legend class="px-3 text-sm font-semibold">
            {{ activeMetricIndex + 1 }}. {{ activeMetric.title }}
          </legend>
          <p class="mt-3 text-sm leading-6 text-sf-text-2">{{ activeMetric.description }}</p>

          <section
            v-if="activeMetric.inputType === 'number'"
            class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            <article
              v-for="company in companies"
              :key="company.id"
              class="rounded-lg bg-sf-bg p-3"
            >
              <h2 class="text-sm font-medium">{{ getCompanyName(company) }}</h2>
              <SfInputNumber
                :model-value="company.metrics[activeMetric.key].value"
                :min="activeMetric.min ?? 0"
                :max="activeMetric.max"
                :step="activeMetric.step ?? 1"
                :precision="(activeMetric.step ?? 1) < 1 ? 1 : 0"
                class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
                @update:model-value="setMetricValue(company.id, $event)"
              />
              <p class="mt-3 text-sm text-sf-text-2">{{ $t("tools_offerUnitLabel", { unit: activeMetric.unit }) }}</p>
              <footer class="mt-3 flex flex-wrap gap-3 border-t border-sf-b pt-3">
                <button
                  type="button"
                  class="h-9 cursor-pointer rounded-xl border px-3 text-sm transition-colors hover:border-sf-theme hover:bg-sf-primary"
                  :class="
                    company.metrics[activeMetric.key].status === 'unknown'
                      ? 'border-sf-theme bg-sf-theme-3 text-sf-theme'
                      : 'border-sf-b bg-sf-primary text-sf-text-2'
                  "
                  :aria-pressed="company.metrics[activeMetric.key].status === 'unknown'"
                  @click="setMetricStatus(company.id, 'unknown')"
                >
                  {{ $t("tools_unknownChoice") }}
                </button>
              </footer>
            </article>
          </section>

          <ul v-else class="mt-3 grid gap-3">
            <li
              v-for="choice in activeMetric.options"
              :key="choice.value"
              class="rounded-lg bg-sf-bg p-3"
            >
              <p class="text-sm font-normal leading-normal">{{ choice.label }}</p>
              <ul class="mt-3 flex flex-wrap gap-3">
                <li v-for="company in companies" :key="company.id">
                  <button
                    type="button"
                    class="h-9 cursor-pointer rounded-xl border px-3 text-sm font-normal transition-colors hover:border-sf-theme hover:bg-sf-primary"
                    :class="
                      company.metrics[activeMetric.key].status === 'value' &&
                      company.metrics[activeMetric.key].value === choice.value
                        ? 'border-sf-theme bg-sf-theme-3 text-sf-theme'
                        : 'border-sf-b bg-sf-primary text-sf-text-2'
                    "
                    :aria-pressed="
                      company.metrics[activeMetric.key].status === 'value' &&
                      company.metrics[activeMetric.key].value === choice.value
                    "
                    :aria-label="$t('tools_offerChoiceAria', { name: getCompanyName(company), label: choice.label })"
                    @click="selectMetricChoice(company.id, choice.value)"
                  >
                    {{ getCompanyName(company) }}
                  </button>
                </li>
              </ul>
            </li>
            <li class="rounded-lg bg-sf-bg p-3">
              <p class="text-sm font-normal">{{ $t("tools_unknownChoice") }}</p>
              <ul class="mt-3 flex flex-wrap gap-3">
                <li v-for="company in companies" :key="company.id">
                  <button
                    type="button"
                    class="h-9 cursor-pointer rounded-xl border px-3 text-sm font-normal transition-colors hover:border-sf-theme hover:bg-sf-primary"
                    :class="
                      company.metrics[activeMetric.key].status === 'unknown'
                        ? 'border-sf-theme bg-sf-theme-3 text-sf-theme'
                        : 'border-sf-b bg-sf-primary text-sf-text-2'
                    "
                    :aria-pressed="company.metrics[activeMetric.key].status === 'unknown'"
                    :aria-label="$t('tools_offerUnknownAria', { name: getCompanyName(company) })"
                    @click="setMetricStatus(company.id, 'unknown')"
                  >
                    {{ getCompanyName(company) }}
                  </button>
                </li>
              </ul>
            </li>
          </ul>

          <footer class="mt-3 flex items-center justify-between gap-3 border-t border-sf-b pt-3">
            <SfButton
              :round="false"
              plain
              :disabled="activeMetricIndex === 0"
              @click="switchMetric(activeMetricIndex - 1)"
            >
              {{ $t("tools_prevItem") }}
            </SfButton>
            <SfButton
              :round="false"
              :disabled="activeMetricIndex === offerComparisonMetrics.length - 1"
              @click="switchMetric(activeMetricIndex + 1)"
            >
              {{ $t("tools_nextItem") }}
            </SfButton>
          </footer>
        </fieldset>

        <section class="rounded-xl border border-sf-b bg-sf-primary p-3 text-center">
          <h2 class="text-base font-semibold">{{ $t("tools_offerViewResult") }}</h2>
          <p class="mt-3 text-sm text-sf-text-2">
            {{
              isCompleted
                ? $t("tools_offerReadyAll")
                : $t("tools_readyPartial", { done: completedCount, total: offerComparisonMetrics.length, remain: offerComparisonMetrics.length - completedCount })
            }}
          </p>
          <SfButton
            :round="false"
            :disabled="!isCompleted"
            class="mx-auto mt-3"
            @click="viewComparisonResult"
          >
            {{ $t("tools_offerViewResult") }}
          </SfButton>
        </section>
      </section>

      <section v-else class="mt-3 rounded-xl border border-sf-b bg-sf-primary p-3 text-center">
        <article
          class="relative text-center"
          aria-live="polite"
        >

          <p class="text-xs font-semibold text-sf-theme">{{ $t("tools_brand") }}</p>
          <h1 class="mt-3 text-lg font-semibold">{{ $t("tools_offerResultTitle") }}</h1>
          <p class="mt-3 rounded-lg bg-sf-theme-3 px-3 py-3 text-sm font-medium text-sf-theme">{{ resultTitle }}</p>

          <ol class="mx-auto mt-3 grid max-w-5xl gap-3 md:grid-cols-2 xl:grid-cols-3">
            <li
              v-for="(result, resultIndex) in rankedCompanies"
              :key="result.company.id"
              class="rounded-lg bg-sf-bg p-3 text-left"
            >
              <p class="text-sm font-semibold text-sf-text-2">{{ $t("tools_offerRank", { rank: resultIndex + 1 }) }}</p>
              <h2 class="mt-3 text-sm font-semibold">{{ getCompanyName(result.company) }}</h2>
              <p class="mt-3 text-3xl font-semibold tabular-nums text-sf-theme">
                {{ result.comparableWeight ? formatScore(result.score) : "—" }}
              </p>
              <p class="mt-3 text-sm text-sf-text-2">{{ $t("tools_offerScoreNote") }}</p>
              <p class="mt-3 text-sm font-semibold">{{ $t("tools_offerAdvantagesTitle") }}</p>
              <p class="mt-3 text-sm leading-6 text-sf-text-2">
                {{ getCompanyAdvantages(result.company).join($t("tools_listSeparator")) || $t("tools_offerNoAdvantages") }}
              </p>
              <p class="mt-3 text-sm font-semibold">{{ $t("tools_offerWeaknessesTitle") }}</p>
              <p class="mt-3 text-sm leading-6 text-sf-text-2">
                {{ getCompanyWeaknesses(result.company).join($t("tools_listSeparator")) || $t("tools_offerNoWeaknesses") }}
              </p>
              <p class="mt-3 text-sm font-semibold">{{ $t("tools_offerPendingTitle") }}</p>
              <p class="mt-3 text-sm leading-6 text-sf-text-2">
                {{ getCompanyPendingMetrics(result.company).join($t("tools_listSeparator")) || $t("tools_none") }}
              </p>
            </li>
          </ol>

          <section class="mt-3 text-left">
            <h2 class="text-base font-semibold text-center">{{ $t("tools_offerTableTitle") }}</h2>
            <div class="mt-3 overflow-x-auto rounded-lg border border-sf-b">
              <table class="w-full min-w-max border-collapse bg-sf-primary text-sm">
                <thead>
                  <tr class="border-b border-sf-b bg-sf-bg text-left">
                    <th class="p-3">{{ $t("tools_offerTableMetricHeader") }}</th>
                    <th v-for="company in companies" :key="company.id" class="p-3">
                      {{ getCompanyName(company) }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="detail in metricDetails"
                    :key="detail.metric.key"
                    class="border-b border-sf-b last:border-b-0"
                  >
                    <th class="sticky left-0 bg-sf-primary p-3 text-left font-medium">{{ detail.metric.title }}</th>
                    <td v-for="company in companies" :key="company.id" class="p-3">
                      <p class="text-sf-text">{{ formatMetricValue(detail.metric, company) }}</p>
                      <!-- 结果状态沿用已有比较结论，信息不足时保持中性提示。 -->
                      <span class="mt-[6px] inline-flex rounded px-[6px] py-[3px] text-xs" :class="getMetricLevel(detail, company) === 'advantage' ? 'bg-sf-success-2 text-sf-success' : getMetricLevel(detail, company) === 'weak' ? 'bg-sf-warning-2 text-sf-warning' : 'bg-sf-bg text-sf-text-2'">
                        {{ getMetricLevelLabel(detail, company) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <footer class="mt-3 border-t border-sf-b pt-3 text-xs text-sf-text-2">
            {{ $t("tools_offerFooterNote") }}
          </footer>
        </article>

        <SfButton :round="false" plain class="mx-auto mt-3" @click="resetComparison">{{ $t("tools_offerReset") }}</SfButton>
      </section>
    </main>
  </SfScrollbar>
</template>
