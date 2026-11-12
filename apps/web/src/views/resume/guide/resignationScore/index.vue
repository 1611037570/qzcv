<script setup lang="ts">
import { computed, ref } from "vue";

import { resignationScoreList, resignationScoreResults } from "./data";

const selectedScores = ref<Array<number | null>>(resignationScoreList.map(() => null));
const showResult = ref(false);
const activeItemIndex = ref(0);

const completedCount = computed(
  () => selectedScores.value.filter((score) => score !== null).length,
);
const activeScoreItem = computed(() => resignationScoreList[activeItemIndex.value]!);
const totalScore = computed(() =>
  selectedScores.value.reduce<number>((total, score) => total + (score ?? 0), 0),
);
const isCompleted = computed(() => completedCount.value === resignationScoreList.length);
const scoreResult = computed(() => {
  if (!isCompleted.value) return null;
  return resignationScoreResults.find(
    (result) => totalScore.value >= result.minScore && totalScore.value <= result.maxScore,
  );
});

// 记录选择后自动进入下一项，最后一项保留在当前页供查看结果。
function selectScore(itemIndex: number, score: number) {
  selectedScores.value[itemIndex] = score;
  showResult.value = false;
  if (itemIndex < resignationScoreList.length - 1) {
    activeItemIndex.value = itemIndex + 1;
  }
}

// 切换当前评分项，已填写内容继续保留。
function switchScoreItem(itemIndex: number) {
  activeItemIndex.value = itemIndex;
}

// 全部完成后由用户主动查看成绩，避免提前展示未完成的总分。
function viewScoreResult() {
  if (isCompleted.value) showResult.value = true;
}

// 清空当前选择，方便重新评估工作现状。
function resetScore() {
  selectedScores.value = resignationScoreList.map(() => null);
  showResult.value = false;
  activeItemIndex.value = 0;
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
        <span aria-current="page">{{ $t("tools_resignBreadcrumb") }}</span>
      </nav>

      <header v-if="!showResult" class="mt-3 mb-3">
        <h1 class="text-lg font-semibold">{{ $t("tools_resignTitle") }}</h1>
        <p class="mt-[6px] max-w-3xl text-xs leading-6 text-sf-text-2">
          {{ $t("tools_resignSubtitle") }}
        </p>
      </header>

      <section class="mt-3">
        <article v-if="!showResult" class="grid gap-3">
          <nav
            class="rounded-xl border border-sf-b bg-sf-primary p-3"
            :aria-label="$t('tools_resignProgressNav')"
          >
            <p class="text-xs font-medium text-sf-text-2">
              {{ $t("tools_progress", { current: activeItemIndex + 1, total: resignationScoreList.length, done: completedCount }) }}
            </p>
            <!-- 进度按实际完成项展示，当前项与已完成项分别使用主题色和成功色。 -->
            <div class="mt-3 h-[3px] overflow-hidden rounded-full bg-sf-bg-2" role="progressbar" :aria-label="$t('tools_resignProgressBar')" :aria-valuenow="completedCount" :aria-valuemax="resignationScoreList.length" :aria-valuemin="0">
              <div class="h-full rounded-full bg-sf-theme transition-[width] duration-300" :style="`width: ${completedCount / resignationScoreList.length * 100}%`" />
            </div>
            <ol class="mt-3 grid grid-cols-5 gap-3 md:grid-cols-10">
              <li v-for="(item, itemIndex) in resignationScoreList" :key="item.title">
                <button
                  type="button"
                  class="flex min-h-15 w-full cursor-pointer flex-col items-center justify-center gap-[6px] rounded-lg border px-[6px] py-[6px] text-sm transition-colors hover:border-sf-theme hover:bg-sf-bg"
                  :class="activeItemIndex === itemIndex
                    ? 'border-sf-theme bg-sf-theme-3 text-sf-theme'
                    : selectedScores[itemIndex] !== null
                      ? 'border-sf-success bg-sf-success-2 text-sf-success'
                      : 'border-sf-b bg-sf-primary text-sf-text-2'"
                  :aria-current="activeItemIndex === itemIndex ? 'step' : undefined"
                  :aria-label="`${itemIndex + 1}. ${item.title}${selectedScores[itemIndex] !== null ? $t('tools_completed') : $t('tools_uncompleted')}`"
                  @click="switchScoreItem(itemIndex)"
                >
                  <span class="font-medium tabular-nums">{{ itemIndex + 1 }}</span>
                  <span class="w-full truncate text-[11px] leading-3">{{ item.title }}</span>
                </button>
              </li>
            </ol>
          </nav>

          <fieldset
            :key="activeScoreItem.title"
            class="rounded-xl border border-sf-b bg-sf-primary p-3"
          >
            <legend class="px-3 text-sm font-semibold">
              {{ activeItemIndex + 1 }}. {{ activeScoreItem.title }}
            </legend>
            <ul class="mt-3 grid gap-3 md:grid-cols-2">
              <li v-for="option in activeScoreItem.options" :key="option.score">
                <button
                  type="button"
                  class="flex min-h-15 w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left font-normal transition-colors hover:border-sf-theme hover:bg-sf-bg"
                  :class="
                    selectedScores[activeItemIndex] === option.score
                      ? 'border-sf-theme bg-sf-theme-3'
                      : 'border-sf-b bg-sf-primary'
                  "
                  :aria-pressed="selectedScores[activeItemIndex] === option.score"
                  @click="selectScore(activeItemIndex, option.score)"
                >
                  <!-- 选中态通过边框和背景区分，选项内只保留文字。 -->
                  <span class="text-sm leading-6 text-sf-text">{{ option.description }}</span>
                </button>
              </li>
            </ul>
            <footer class="mt-3 flex items-center justify-between gap-3 border-t border-sf-b pt-3">
              <SfButton
                :round="false"
                plain
                :disabled="activeItemIndex === 0"
                @click="switchScoreItem(activeItemIndex - 1)"
              >
                {{ $t("tools_prevItem") }}
              </SfButton>
              <SfButton
                :round="false"
                :disabled="activeItemIndex === resignationScoreList.length - 1"
                @click="switchScoreItem(activeItemIndex + 1)"
              >
                {{ $t("tools_nextItem") }}
              </SfButton>
            </footer>
          </fieldset>
        </article>

        <section class="mt-3 rounded-xl border border-sf-b bg-sf-primary p-3 text-center">
          <template v-if="!showResult">
            <h2 class="text-base font-semibold">{{ $t("tools_resignViewResult") }}</h2>
            <p class="mt-3 text-sm text-sf-text-2">
              {{
                isCompleted
                  ? $t("tools_resignReadyAll")
                  : $t("tools_readyPartial", { done: completedCount, total: resignationScoreList.length, remain: resignationScoreList.length - completedCount })
              }}
            </p>
            <SfButton
              :round="false"
              :disabled="!isCompleted"
              class="mx-auto mt-3"
              @click="viewScoreResult"
            >
              {{ $t("tools_resignViewResult") }}
            </SfButton>
          </template>

          <article
            v-if="showResult && scoreResult"
            class="relative overflow-hidden rounded-lg bg-sf-theme-3 p-3 text-center"
            aria-live="polite"
          >

            <p class="text-xs font-semibold text-sf-theme">{{ $t("tools_brand") }}</p>
            <h2 class="mt-3 text-lg font-semibold">{{ $t("tools_resignResultTitle") }}</h2>
            <p class="mt-3 text-xs text-sf-text-2">{{ $t("tools_resignScoreLabel") }}</p>
            <p class="mt-3 text-5xl font-semibold tracking-tight tabular-nums text-sf-theme">
              {{ totalScore }}<span class="text-sm text-sf-text-2"> / 100</span>
            </p>
            <p
              class="mx-auto mt-3 w-fit rounded-full border border-sf-theme bg-sf-theme-3 px-3 text-sm font-medium text-sf-theme"
            >
              {{ scoreResult.rangeLabel }}
            </p>
            <p class="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-normal text-sf-text">
              {{ scoreResult.content }}
            </p>
            <footer class="mt-3 border-t border-sf-b pt-3 text-xs text-sf-text-2">
              {{ $t("tools_resignFooterNote") }}
            </footer>
          </article>

          <SfButton v-if="showResult" plain class="mx-auto mt-3" @click="resetScore">
            {{ $t("tools_resignReset") }}
          </SfButton>
        </section>
      </section>
    </main>
  </SfScrollbar>
</template>
