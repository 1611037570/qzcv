<script setup lang="ts">
// 求职工具入口：三个决策工具各自独立成页，这里只做导航入口，不承载工具内容。
</script>

<template>
  <SfScrollbar class="h-full bg-sf-page" flush>
    <!-- 入口移除装饰图标，页面与卡片统一使用紧凑内边距。 -->
    <main class="w-full p-3 text-sf-text">
      <header>
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-lg font-semibold text-sf-text">{{ $t("resumeGuideToolsTitle") }}</h1>
        </div>
        <p class="mt-[6px] max-w-3xl text-xs leading-6 text-sf-text-2">
          {{ $t("resumeGuideToolsDescription") }}
        </p>
      </header>

      <!-- 工具入口沿用模型接入页的紧凑卡片与主题色。 -->
      <section class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" :aria-label="$t('resumeGuideToolsTitle')">
        <RouterLink
          to="/resume/tools/resignation-score"
          class="group flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3 transition-colors hover:border-sf-theme hover:bg-sf-bg"
        >
          <article>
            <p class="w-fit rounded-lg bg-sf-theme-3 px-3 py-[3px] text-xs font-medium text-sf-theme">{{ $t("tools_resignCategoryBadge") }}</p>
            <h2 class="mt-[6px] text-base leading-6 font-semibold text-sf-text">{{ $t("tools_resignTitle") }}</h2>
            <p class="mt-3 text-sm leading-6 text-sf-text-2">
              {{ $t("tools_resignCardDescription") }}
            </p>
          </article>
          <strong class="mt-auto flex items-center justify-between border-t border-sf-b pt-3 text-xs font-medium text-sf-theme"><span>{{ $t("tools_resignStart") }}</span><SfIcon icon="mingcute:arrow-right-line" size="4" /></strong>
        </RouterLink>

        <RouterLink
          to="/resume/tools/offer-comparison"
          class="group flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3 transition-colors hover:border-sf-theme hover:bg-sf-bg"
        >
          <article>
            <p class="w-fit rounded-lg bg-sf-success-2 px-3 py-[3px] text-xs font-medium text-sf-success">{{ $t("tools_offerCategoryBadge") }}</p>
            <h2 class="mt-[6px] text-base leading-6 font-semibold text-sf-text">{{ $t("tools_offerTitle") }}</h2>
            <p class="mt-3 text-sm leading-6 text-sf-text-2">
              {{ $t("tools_offerCardDescription") }}
            </p>
          </article>
          <strong class="mt-auto flex items-center justify-between border-t border-sf-b pt-3 text-xs font-medium text-sf-theme"><span>{{ $t("tools_offerStart") }}</span><SfIcon icon="mingcute:arrow-right-line" size="4" /></strong>
        </RouterLink>

        <RouterLink
          to="/resume/tools/real-hourly-wage"
          class="group flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3 transition-colors hover:border-sf-theme hover:bg-sf-bg"
        >
          <article>
            <p class="w-fit rounded-lg bg-sf-warning-2 px-3 py-[3px] text-xs font-medium text-sf-warning">{{ $t("tools_wageCategoryBadge") }}</p>
            <h2 class="mt-[6px] text-base leading-6 font-semibold text-sf-text">{{ $t("tools_wageTitle") }}</h2>
            <p class="mt-3 text-sm leading-6 text-sf-text-2">
              {{ $t("tools_wageCardDescription") }}
            </p>
          </article>
          <strong class="mt-auto flex items-center justify-between border-t border-sf-b pt-3 text-xs font-medium text-sf-theme"><span>{{ $t("tools_wageStart") }}</span><SfIcon icon="mingcute:arrow-right-line" size="4" /></strong>
        </RouterLink>
      </section>

      <footer class="mt-3 rounded-xl bg-sf-theme-3 p-3 text-xs leading-6 text-sf-text-2">
        <p class="font-semibold text-sf-text">{{ $t("resumeToolsFooterTitle") }}</p>
        <p class="mt-3">
          {{ $t("resumeToolsFooterDescription") }}
          <RouterLink to="/resume/guide" class="text-sf-theme transition-colors hover:underline">
            {{ $t("resumeGuideTitle") }}
          </RouterLink>
        </p>
      </footer>
    </main>
  </SfScrollbar>
</template>
