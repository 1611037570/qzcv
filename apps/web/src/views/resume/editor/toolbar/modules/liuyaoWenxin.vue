<script setup>
import { computed, onUnmounted, ref } from "vue";
import { useResumeStore } from "@/stores";
import { storeToRefs } from "pinia";
import { $t } from "@/locales";

const resumeStore = useResumeStore();
const { system } = storeToRefs(resumeStore);
// 六爻问心弹窗可见性
const visible = ref(false);
// 卦阵仅由中央圆触发展开
const expanded = ref(false);
// 工具栏卦象只由入口圆触发展开
const entryExpanded = ref(false);
let entryHoverTimer = null;
// 后天八卦方位：卦名沿方位放在对应爻象外侧，name 仅作内部标识与排序键
const trigrams = [
  { name: "li", textKey: "liuyao_triLi", x: 160, y: 36, labelX: 0, labelY: -28, rotate: 0, lines: [true, false, true] },
  { name: "kun", textKey: "liuyao_triKun", x: 248, y: 72, labelX: 20, labelY: -20, rotate: 45, lines: [false, false, false] },
  { name: "dui", textKey: "liuyao_triDui", x: 284, y: 160, labelX: 28, labelY: 0, rotate: 90, lines: [false, true, true] },
  { name: "qian", textKey: "liuyao_triQian", x: 248, y: 248, labelX: 20, labelY: 20, rotate: -45, lines: [true, true, true] },
  { name: "kan", textKey: "liuyao_triKan", x: 160, y: 284, labelX: 0, labelY: 28, rotate: 0, lines: [false, true, false] },
  { name: "gen", textKey: "liuyao_triGen", x: 72, y: 248, labelX: -20, labelY: 20, rotate: 45, lines: [true, false, false] },
  { name: "zhen", textKey: "liuyao_triZhen", x: 36, y: 160, labelX: -28, labelY: 0, rotate: 90, lines: [false, false, true] },
  { name: "xun", textKey: "liuyao_triXun", x: 72, y: 72, labelX: -20, labelY: -20, rotate: -45, lines: [true, true, false] },
];

// 正念呼吸：吸气 3 秒、吐气 3 秒
const PHASE_MS = 3000;
// 一轮呼吸总时长
const CYCLE_MS = PHASE_MS * 2;
// 是否处于呼吸引导中
const breathing = ref(false);
// 当前呼吸阶段：in 吸气 / out 吐气，空串表示未开始
const phase = ref("");
// 剩余秒数
const remain = ref(0);
// 呼吸引导的定时器
let timer = null;
// 按钮文案：引导中展示倒计时
const buttonText = computed(() => (breathing.value ? $t("liuyao_breathing", { remain: remain.value }) : $t("liuyao_startMindful")));

const openEntry = () => {
  clearTimeout(entryHoverTimer);
  entryExpanded.value = true;
};

const closeEntry = () => {
  clearTimeout(entryHoverTimer);
  entryHoverTimer = setTimeout(() => {
    entryExpanded.value = false;
  }, 180);
};

// 结束呼吸引导并复位
const stopBreathing = () => {
  if (timer) clearInterval(timer);
  timer = null;
  breathing.value = false;
  phase.value = "";
  remain.value = 0;
};

// 开始呼吸引导：按已过时长切换阶段，倒计时按当前阶段剩余时长计算
const startBreathing = () => {
  if (breathing.value) return;
  breathing.value = true;
  phase.value = "in";
  remain.value = PHASE_MS / 1000;
  const startAt = Date.now();
  timer = setInterval(() => {
    const elapsed = Date.now() - startAt;
    if (elapsed >= CYCLE_MS) {
      stopBreathing();
      return;
    }
    phase.value = elapsed < PHASE_MS ? "in" : "out";
    remain.value = Math.ceil((PHASE_MS - (elapsed % PHASE_MS)) / 1000);
  }, 100);
};

onUnmounted(() => {
  stopBreathing();
  clearTimeout(entryHoverTimer);
});
</script>

<template>
  <!-- 调试模式下显示六爻问心入口 -->
  <div
    v-if="system.showDebug"
    class="relative z-50 h-10 w-10"
    @mouseleave="closeEntry"
  >
    <div
      class="absolute bottom-1/2 left-1/2 h-48 w-48 -translate-x-1/2 translate-y-1/2 cursor-pointer transition-all duration-500 ease-out"
      :class="entryExpanded ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'"
      @mouseenter="openEntry"
      @mouseleave="closeEntry"
      @click="visible = true"
    >
      <div
        class="absolute inset-2 rounded-full border border-sf-theme/40 transition-transform duration-[20s] ease-linear"
        :class="entryExpanded ? 'rotate-180' : 'rotate-0'"
      />
      <div class="absolute inset-5 rounded-full border border-dashed border-sf-theme/50" />
      <div class="absolute inset-8 rounded-full border border-sf-theme/30" />
      <span class="absolute top-1 left-1/2 -translate-x-1/2 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triQian") }}</span
      >
      <span class="absolute top-6 right-5 rotate-45 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triXun") }}</span
      >
      <span class="absolute top-1/2 right-0 -translate-y-1/2 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triKan") }}</span
      >
      <span class="absolute right-5 bottom-6 -rotate-45 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triGen") }}</span
      >
      <span
        class="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triKun") }}</span
      >
      <span class="absolute bottom-6 left-5 rotate-45 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triZhen") }}</span
      >
      <span class="absolute top-1/2 left-0 -translate-y-1/2 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triLi") }}</span
      >
      <span class="absolute top-6 left-5 -rotate-45 text-xs tracking-widest text-sf-theme"
        >{{ $t("liuyao_triDui") }}</span
      >
      <div
        class="absolute right-1/2 bottom-1/2 translate-x-1/2 translate-y-1/2 text-center text-sf-text"
      >
        <div class="text-sm font-semibold tracking-[0.5em]">{{ $t("liuyao_weiji") }}</div>
        <div class="mt-1 text-xs tracking-widest text-sf-text-3">{{ $t("liuyao_weijiFull") }}</div>
        <div class="mt-1 text-[10px] tracking-wider text-sf-text-3">{{ $t("liuyao_weijiQuote") }}</div>
      </div>
    </div>
    <button
      type="button"
      :aria-label="$t('liuyao_openAria')"
      class="relative z-10 flex h-10 w-10 cursor-pointer flex-col items-center justify-evenly rounded-xl border bg-transparent transition-all duration-300 hover:scale-105 hover:border-sf-theme active:scale-95"
      :class="visible || entryExpanded ? 'border-sf-theme' : 'border-transparent'"
      @mouseenter="openEntry"
      @mouseleave="closeEntry"
      @click="visible = true"
    >
      <!-- 未济卦象：离上坎下，六爻自上而下阴阳交错 -->
      <span
        class="h-1 w-6 rounded-sm transition-colors"
        :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
      />
      <span class="flex w-6 gap-2">
        <span
          class="h-1 flex-1 rounded-sm transition-colors"
          :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
        />
        <span
          class="h-1 flex-1 rounded-sm transition-colors"
          :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
        />
      </span>
      <span
        class="h-1 w-6 rounded-sm transition-colors"
        :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
      />
      <span class="flex w-6 gap-2">
        <span
          class="h-1 flex-1 rounded-sm transition-colors"
          :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
        />
        <span
          class="h-1 flex-1 rounded-sm transition-colors"
          :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
        />
      </span>
      <span
        class="h-1 w-6 rounded-sm transition-colors"
        :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
      />
      <span class="flex w-6 gap-2">
        <span
          class="h-1 flex-1 rounded-sm transition-colors"
          :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
        />
        <span
          class="h-1 flex-1 rounded-sm transition-colors"
          :class="entryExpanded ? 'bg-sf-theme-text' : 'bg-sf-theme'"
        />
      </span>
    </button>
  </div>

  <!-- 六爻问心弹窗：正念呼吸引导 -->
  <SfModal v-model="visible" :title="$t('liuyao_title')">
    <div class="flex w-[480px] flex-col items-center gap-6 p-9">
      <div class="flex flex-col items-center gap-3" @mouseleave="expanded = false">
        <div class="relative flex h-80 w-80 items-center justify-center">
          <!-- 悬停展开八卦环，给每个卦位留出完整显示空间 -->
          <div
            class="absolute inset-3 rounded-full border border-sf-theme/40 transition-all duration-500 ease-out"
            :class="expanded ? 'scale-100 opacity-100' : 'scale-75 opacity-0'"
          >
            <svg
              viewBox="0 0 320 320"
              class="absolute inset-0 h-full w-full overflow-visible text-sf-theme"
              aria-hidden="true"
            >
              <circle
                cx="160"
                cy="160"
                r="124"
                fill="none"
                stroke="currentColor"
                stroke-dasharray="3 5"
                stroke-opacity="0.45"
              />
            </svg>
          </div>
          <svg
            viewBox="0 0 320 320"
            class="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)] origin-center overflow-visible transition-all duration-500 ease-out"
            :class="expanded ? 'scale-100 opacity-100 delay-200' : 'scale-75 opacity-0 delay-0'"
            aria-hidden="true"
          >
            <g
              v-for="trigram in trigrams"
              :key="trigram.name"
              :transform="`translate(${trigram.x} ${trigram.y})`"
            >
              <text
                :x="trigram.labelX"
                :y="trigram.labelY"
                text-anchor="middle"
                class="fill-sf-text text-[11px] font-medium"
              >
                {{ $t(trigram.textKey) }}
              </text>
              <g :transform="`rotate(${trigram.rotate})`" class="fill-sf-theme">
                <g v-for="(solid, index) in trigram.lines" :key="index">
                  <rect v-if="solid" x="-24" :y="-15 + index * 15" width="48" height="7" rx="1" />
                  <template v-else>
                    <rect x="-24" :y="-15 + index * 15" width="20" height="7" rx="1" />
                    <rect x="4" :y="-15 + index * 15" width="20" height="7" rx="1" />
                  </template>
                </g>
              </g>
            </g>
          </svg>
          <button
            type="button"
            :aria-label="$t('liuyao_breathAria')"
            :aria-pressed="breathing"
            :disabled="breathing"
            class="relative z-10 flex h-32 w-32 cursor-pointer items-center justify-center rounded-full border border-sf-theme/50 bg-gradient-to-br from-sf-theme to-sf-theme-2 text-sm tracking-widest text-sf-theme-text shadow-xl shadow-sf-theme/20 transition-transform ease-in-out disabled:cursor-default"
            :class="[
              breathing ? 'duration-[3000ms]' : 'duration-700',
              phase === 'in'
                ? 'scale-110'
                : phase === 'out'
                  ? 'scale-90'
                  : expanded
                    ? 'scale-105'
                    : 'scale-100',
            ]"
            @mouseenter="expanded = true"
            @click="startBreathing"
          >
            {{ phase ? (phase === "in" ? $t("liuyao_inhale") : $t("liuyao_exhale")) : $t("liuyao_start") }}
          </button>
        </div>
        <div
          class="h-12 text-center transition-opacity duration-300"
          :class="expanded ? 'opacity-100 delay-[240ms]' : 'opacity-0 delay-0'"
        >
          <div class="text-sm font-semibold tracking-[0.5em] text-sf-text">{{ $t("liuyao_weijiBand") }}</div>
          <div class="mt-1 text-xs tracking-widest text-sf-text-3">{{ $t("liuyao_weijiQuote") }}</div>
        </div>
      </div>
      <div class="h-5 text-sm tracking-widest text-sf-text-3">
        {{ breathing ? buttonText : $t("liuyao_hoverTip") }}
      </div>
    </div>
  </SfModal>
</template>

<style lang="scss" scoped></style>
