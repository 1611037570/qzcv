<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import {
  holidayRestOptions,
  workScheduleOptions,
  type HolidayRestKey,
  type WorkScheduleKey,
} from "./data";

/** 真实时薪计算表单。 */
interface HourlyWageForm {
  /** 写入合同或制度的年度确定性现金总包。 */
  annualGuaranteedPackage: number | undefined;
  /** 未计入总包的年度加班费或固定现金补贴。 */
  annualAdditionalCash: number | undefined;
  /** 当前工作的休息制度。 */
  workSchedule: WorkScheduleKey | "";
  /** 固定月休制度下每月休息的天数。 */
  monthlyRestDays: number | undefined;
  /** 每个工作日实际投入的工作小时数。 */
  dailyWorkHours: number | undefined;
  /** 单程通勤所需分钟数。 */
  oneWayCommuteMinutes: number | undefined;
  /** 每年实际可以使用的带薪年假天数。 */
  annualPaidLeaveDays: number | undefined;
  /** 法定节假日实际能够休息的档位。 */
  holidayRest: HolidayRestKey | "";
}

/** 真实时薪的完整计算结果。 */
interface HourlyWageResult {
  /** 全年实际获得的现金收入。 */
  annualCashIncome: number;
  /** 全年预计需要工作的天数。 */
  annualWorkDays: number;
  /** 全年工作投入小时数。 */
  annualWorkHours: number;
  /** 全年往返通勤小时数。 */
  annualCommuteHours: number;
  /** 全年工作和通勤合计占用小时数。 */
  annualOccupiedHours: number;
  /** 将工作和通勤同时计入后的真实时薪。 */
  realHourlyWage: number;
  /** 全部休息日折算后的月均休息天数。 */
  averageMonthlyRestDays: number;
  /** 标准双休岗位保持相同真实时薪所需的等价年薪。 */
  doubleWeekendEquivalentSalary: number;
  /** 当前制度相对标准双休每年多占用的小时数。 */
  occupiedHoursDifference: number;
}

// 创建空白表单，避免重新计算时遗漏字段。
function createInitialForm(): HourlyWageForm {
  return {
    annualGuaranteedPackage: undefined,
    annualAdditionalCash: 0,
    workSchedule: "",
    monthlyRestDays: undefined,
    dailyWorkHours: undefined,
    oneWayCommuteMinutes: undefined,
    annualPaidLeaveDays: undefined,
    holidayRest: "",
  };
}

const form = reactive<HourlyWageForm>(createInitialForm());
const showResult = ref(false);

const selectedSchedule = computed(() =>
  workScheduleOptions.find((option) => option.key === form.workSchedule),
);
const selectedHolidayRest = computed(() =>
  holidayRestOptions.find((option) => option.key === form.holidayRest),
);

// 固定制度直接读取年度休息日，自定义月休按十二个月折算。
const scheduleAnnualRestDays = computed(() => {
  if (form.workSchedule === "fixedMonthlyRest") return (form.monthlyRestDays ?? 0) * 12;
  return selectedSchedule.value?.annualRestDays ?? 0;
});

const hasRequiredValues = computed(() => {
  const requiredNumbers = [
    form.annualGuaranteedPackage,
    form.annualAdditionalCash,
    form.dailyWorkHours,
    form.oneWayCommuteMinutes,
    form.annualPaidLeaveDays,
  ];
  const hasNumbers = requiredNumbers.every(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  const hasCustomRestDays =
    form.workSchedule !== "fixedMonthlyRest" ||
    (typeof form.monthlyRestDays === "number" && Number.isFinite(form.monthlyRestDays));
  return hasNumbers && Boolean(form.workSchedule) && Boolean(form.holidayRest) && hasCustomRestDays;
});

const totalAnnualRestDays = computed(() =>
  scheduleAnnualRestDays.value +
  (form.annualPaidLeaveDays ?? 0) +
  (selectedHolidayRest.value?.annualRestDays ?? 0),
);

const hasValidWorkDays = computed(
  () => !hasRequiredValues.value || totalAnnualRestDays.value < 365,
);

// 按三百六十五天和五十二周口径统一计算时间成本与等价收入。
const calculationResult = computed<HourlyWageResult | null>(() => {
  if (!hasRequiredValues.value || !hasValidWorkDays.value) return null;

  const annualCashIncome =
    (form.annualGuaranteedPackage ?? 0) + (form.annualAdditionalCash ?? 0);
  const annualWorkDays = 365 - totalAnnualRestDays.value;
  const annualWorkHours = annualWorkDays * (form.dailyWorkHours ?? 0);
  const dailyCommuteHours = (form.oneWayCommuteMinutes ?? 0) * 2 / 60;
  const annualCommuteHours = annualWorkDays * dailyCommuteHours;
  const annualOccupiedHours = annualWorkHours + annualCommuteHours;
  const realHourlyWage = annualOccupiedHours > 0 ? annualCashIncome / annualOccupiedHours : 0;
  const doubleWeekendWorkDays = Math.max(
    365 - 104 - (form.annualPaidLeaveDays ?? 0) -
      (selectedHolidayRest.value?.annualRestDays ?? 0),
    0,
  );
  const doubleWeekendOccupiedHours =
    doubleWeekendWorkDays * ((form.dailyWorkHours ?? 0) + dailyCommuteHours);

  return {
    annualCashIncome,
    annualWorkDays,
    annualWorkHours,
    annualCommuteHours,
    annualOccupiedHours,
    realHourlyWage,
    averageMonthlyRestDays: totalAnnualRestDays.value / 12,
    doubleWeekendEquivalentSalary: realHourlyWage * doubleWeekendOccupiedHours,
    occupiedHoursDifference: annualOccupiedHours - doubleWeekendOccupiedHours,
  };
});

// 选择休息制度时清理与其他制度无关的自定义月休值。
function selectWorkSchedule(schedule: WorkScheduleKey) {
  form.workSchedule = schedule;
  if (schedule !== "fixedMonthlyRest") form.monthlyRestDays = undefined;
}

// 选择法定节假日档位，由配置直接提供参与计算的休息天数。
function selectHolidayRest(option: HolidayRestKey) {
  form.holidayRest = option;
}

// 表单有效时隐藏填写内容并展示计算结果。
function viewResult() {
  if (calculationResult.value) showResult.value = true;
}

// 返回填写区域时保留当前数据，便于继续调整比较。
function editValues() {
  showResult.value = false;
}

// 清空当前数据并恢复首次进入页面的状态。
function resetCalculator() {
  Object.assign(form, createInitialForm());
  showResult.value = false;
}

// 金额统一按人民币整数展示。
function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

// 小时与天数保留一位小数，并移除整数末尾的小数点。
function formatDecimal(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// 真实时薪保留两位小数，便于比较小幅收入差异。
function formatHourlyWage(value: number) {
  return value.toFixed(2);
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
        <span aria-current="page">{{ $t("tools_wageTitle") }}</span>
      </nav>

      <template v-if="!showResult">
        <header class="mt-3 mb-3">
          <h1 class="text-lg font-semibold">{{ $t("tools_wageTitle") }}</h1>
          <p class="mt-[6px] max-w-3xl text-xs leading-6 text-sf-text-2">
            {{ $t("tools_wageSubtitle") }}
          </p>
        </header>

        <form class="mt-3 grid gap-3" @submit.prevent="viewResult">
          <fieldset class="rounded-xl border border-sf-b bg-sf-primary p-3">
            <legend class="px-3 text-sm font-semibold">{{ $t("tools_wageIncomeLegend") }}</legend>
            <section class="mt-3 grid gap-3 md:grid-cols-2">
              <label class="rounded-lg bg-sf-bg p-3 text-sm font-semibold">
                {{ $t("tools_wagePackageLabel") }}
                <SfInputNumber
                  v-model="form.annualGuaranteedPackage"
                  :min="0"
                  :max="10000000"
                  :step="1000"
                  class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
                />
                <span class="mt-[6px] block text-xs leading-6 font-normal text-sf-text-2">
                  {{ $t("tools_wagePackageHint") }}
                </span>
              </label>
              <label class="rounded-lg bg-sf-bg p-3 text-sm font-semibold">
                {{ $t("tools_wageExtraLabel") }}
                <SfInputNumber
                  v-model="form.annualAdditionalCash"
                  :min="0"
                  :max="10000000"
                  :step="1000"
                  class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
                />
                <span class="mt-[6px] block text-xs leading-6 font-normal text-sf-text-2">
                  {{ $t("tools_wageExtraHint") }}
                </span>
              </label>
            </section>
          </fieldset>

          <fieldset class="rounded-xl border border-sf-b bg-sf-primary p-3">
            <legend class="px-3 text-sm font-semibold">{{ $t("tools_wageScheduleLegend") }}</legend>
            <ul class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <li v-for="schedule in workScheduleOptions" :key="schedule.key">
                <button
                  type="button"
                  class="h-full min-h-9 w-full cursor-pointer rounded-lg border px-3 py-3 text-left font-normal transition-colors hover:border-sf-theme hover:bg-sf-bg"
                  :class="
                    form.workSchedule === schedule.key
                      ? 'border-sf-theme bg-sf-theme-3'
                      : 'border-sf-b bg-sf-bg'
                  "
                  :aria-pressed="form.workSchedule === schedule.key"
                  @click="selectWorkSchedule(schedule.key)"
                >
                  <span
                    class="text-sm"
                    :class="form.workSchedule === schedule.key ? 'text-sf-theme' : 'text-sf-text'"
                  >
                    {{ schedule.label }}
                  </span>
                  <span class="mt-[6px] block text-xs leading-6 text-sf-text-2">
                    {{ schedule.description }}
                  </span>
                </button>
              </li>
            </ul>
            <label
              v-if="form.workSchedule === 'fixedMonthlyRest'"
              class="mt-3 block rounded-lg bg-sf-bg p-3 text-sm font-semibold"
            >
              {{ $t("tools_wageMonthlyRestLabel") }}
              <SfInputNumber
                v-model="form.monthlyRestDays"
                :min="0"
                :max="30"
                :step="1"
                class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
              />
              <span class="mt-[6px] block text-xs leading-6 font-normal text-sf-text-2">
                {{ $t("tools_wageMonthlyRestHint") }}
              </span>
            </label>
          </fieldset>

          <fieldset class="rounded-xl border border-sf-b bg-sf-primary p-3">
            <legend class="px-3 text-sm font-semibold">{{ $t("tools_wageHolidayLegend") }}</legend>
            <ul class="mt-3 grid gap-3 md:grid-cols-3">
              <li v-for="option in holidayRestOptions" :key="option.key">
                <button
                  type="button"
                  class="h-full min-h-9 w-full cursor-pointer rounded-lg border px-3 py-3 text-left font-normal transition-colors hover:border-sf-theme hover:bg-sf-bg"
                  :class="
                    form.holidayRest === option.key
                      ? 'border-sf-theme bg-sf-theme-3'
                      : 'border-sf-b bg-sf-bg'
                  "
                  :aria-pressed="form.holidayRest === option.key"
                  @click="selectHolidayRest(option.key)"
                >
                  <span
                    class="text-sm"
                    :class="form.holidayRest === option.key ? 'text-sf-theme' : 'text-sf-text'"
                  >
                    {{ option.label }}
                  </span>
                  <span class="mt-[6px] block text-xs leading-6 text-sf-text-2">
                    {{ option.description }}
                  </span>
                </button>
              </li>
            </ul>
          </fieldset>

          <fieldset class="rounded-xl border border-sf-b bg-sf-primary p-3">
            <legend class="px-3 text-sm font-semibold">{{ $t("tools_wageTimeLegend") }}</legend>
            <section class="mt-3 grid gap-3 md:grid-cols-3">
              <label class="rounded-lg bg-sf-bg p-3 text-sm font-semibold">
                {{ $t("tools_wageDailyHoursLabel") }}
                <SfInputNumber
                  v-model="form.dailyWorkHours"
                  :min="1"
                  :max="24"
                  :step="0.5"
                  :precision="1"
                  class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
                />
                <span class="mt-[6px] block text-xs leading-6 font-normal text-sf-text-2">{{ $t("tools_wageDailyHoursHint") }}</span>
              </label>
              <label class="rounded-lg bg-sf-bg p-3 text-sm font-semibold">
                {{ $t("tools_wageCommuteLabel") }}
                <SfInputNumber
                  v-model="form.oneWayCommuteMinutes"
                  :min="0"
                  :max="300"
                  :step="5"
                  class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
                />
                <span class="mt-[6px] block text-xs leading-6 font-normal text-sf-text-2">{{ $t("tools_wageCommuteHint") }}</span>
              </label>
              <label class="rounded-lg bg-sf-bg p-3 text-sm font-semibold">
                {{ $t("tools_wageLeaveLabel") }}
                <SfInputNumber
                  v-model="form.annualPaidLeaveDays"
                  :min="0"
                  :max="60"
                  :step="1"
                  class="mt-3 h-9 w-full rounded-lg border border-sf-b bg-sf-primary text-sm"
                />
                <span class="mt-[6px] block text-xs leading-6 font-normal text-sf-text-2">{{ $t("tools_wageLeaveHint") }}</span>
              </label>
            </section>
          </fieldset>

          <section class="rounded-xl border border-sf-b bg-sf-primary p-3 text-center">
            <p v-if="!hasValidWorkDays" class="text-sm font-semibold text-sf-error">
              {{ $t("tools_wageErrorDays") }}
            </p>
            <p v-else class="text-sm text-sf-text-2">
              {{ $t("tools_wagePrivacyNote") }}
            </p>
            <SfButton
              :round="false"
              :disabled="!calculationResult"
              class="mx-auto mt-3"
              @click="viewResult"
            >
              {{ $t("tools_wageSubmit") }}
            </SfButton>
          </section>
        </form>
      </template>

      <section v-else-if="calculationResult" class="mt-3 rounded-xl border border-sf-b bg-sf-primary p-3">
        <!-- 主结果独立呈现，收入与时间明细保持在下方卡片中。 -->
        <header class="rounded-lg bg-sf-theme-3 p-3 text-center">
          <p class="text-xs font-semibold text-sf-theme">{{ $t("tools_brand") }}</p>
          <h1 class="mt-3 text-lg font-semibold">{{ $t("tools_wageResultTitle") }}</h1>
          <p class="mt-3 text-5xl font-semibold tracking-tight tabular-nums text-sf-theme">
            ¥{{ formatHourlyWage(calculationResult.realHourlyWage) }}
          </p>
          <p class="mt-3 text-sm text-sf-text-2">{{ $t("tools_wageResultSubtitle") }}</p>
        </header>

        <dl class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div class="rounded-lg bg-sf-bg p-3">
            <dt class="text-sm text-sf-text-2">{{ $t("tools_wageIncomeLegend") }}</dt>
            <dd class="mt-[6px] text-lg font-semibold text-sf-text tabular-nums">{{ formatCurrency(calculationResult.annualCashIncome) }}</dd>
          </div>
          <div class="rounded-lg bg-sf-bg p-3">
            <dt class="text-sm text-sf-text-2">{{ $t("tools_wageWorkDays") }}</dt>
            <dd class="mt-[6px] text-lg font-semibold text-sf-text tabular-nums">{{ formatDecimal(calculationResult.annualWorkDays) }} {{ $t("tools_wageUnitDay") }}</dd>
          </div>
          <div class="rounded-lg bg-sf-bg p-3">
            <dt class="text-sm text-sf-text-2">{{ $t("tools_wageMonthlyRestDays") }}</dt>
            <dd class="mt-[6px] text-lg font-semibold text-sf-text tabular-nums">{{ formatDecimal(calculationResult.averageMonthlyRestDays) }} {{ $t("tools_wageUnitDay") }}</dd>
          </div>
          <div class="rounded-lg bg-sf-bg p-3">
            <dt class="text-sm text-sf-text-2">{{ $t("tools_wageAnnualWorkHours") }}</dt>
            <dd class="mt-[6px] text-lg font-semibold text-sf-text tabular-nums">{{ formatDecimal(calculationResult.annualWorkHours) }} {{ $t("tools_wageUnitHour") }}</dd>
          </div>
          <div class="rounded-lg bg-sf-bg p-3">
            <dt class="text-sm text-sf-text-2">{{ $t("tools_wageAnnualCommuteHours") }}</dt>
            <dd class="mt-[6px] text-lg font-semibold text-sf-text tabular-nums">{{ formatDecimal(calculationResult.annualCommuteHours) }} {{ $t("tools_wageUnitHour") }}</dd>
          </div>
          <div class="rounded-lg bg-sf-bg p-3">
            <dt class="text-sm text-sf-text-2">{{ $t("tools_wageAnnualOccupied") }}</dt>
            <dd class="mt-[6px] text-lg font-semibold text-sf-text tabular-nums">{{ formatDecimal(calculationResult.annualOccupiedHours) }} {{ $t("tools_wageUnitHour") }}</dd>
          </div>
        </dl>

        <section class="mt-3 rounded-xl border border-sf-theme bg-sf-theme-3 p-3">
          <h2 class="text-sm font-semibold text-sf-theme">{{ $t("tools_wageEquivalentTitle") }}</h2>
          <p class="mt-3 text-sm leading-6 text-sf-text">
            {{ $t("tools_wageEquivalentBefore") }}
            <strong class="text-sf-theme">{{ formatCurrency(calculationResult.doubleWeekendEquivalentSalary) }}</strong>
            {{ $t("tools_wageEquivalentAfter") }}
          </p>
          <p class="mt-3 text-sm text-sf-text-2">
            {{
              $t("tools_wageHoursDiff", {
                mode: calculationResult.occupiedHoursDifference >= 0 ? $t("tools_wageMoreHours") : $t("tools_wageLessHours"),
                hours: formatDecimal(Math.abs(calculationResult.occupiedHoursDifference)),
              })
            }}
          </p>
        </section>

        <footer class="mt-3 border-t border-sf-b pt-3 text-xs leading-6 text-sf-text-2">
          {{ $t("tools_wageFooterNote") }}
        </footer>

        <section class="mt-3 flex flex-wrap justify-center gap-3">
          <SfButton :round="false" plain @click="editValues">{{ $t("tools_wageEdit") }}</SfButton>
          <SfButton :round="false" plain @click="resetCalculator">{{ $t("tools_wageReset") }}</SfButton>
        </section>
      </section>
    </main>
  </SfScrollbar>
</template>
