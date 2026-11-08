<script setup>
import { ref } from "vue";
import { useOverlayKeys } from "@/hooks/modules/useOverlayKeys";
import resumeBeta from "@/assets/images/resume/resume-beta.awebp";
import resumeBeta1 from "@/assets/images/resume/beta1.webp";
import resumeV1 from "@/assets/images/resume/v1.webp";
import resumeV2 from "@/assets/images/resume/v2.png";

const visible = ref(false);
const previewVisible = ref(false);
// 当前记录对应的预览图片。
const previewImage = ref("");

// 图片预览位于介绍弹窗上层，按退出键时只关闭图片。
useOverlayKeys({ escape: () => { previewVisible.value = false; } }, previewVisible);

// 仅迁入旧项目中简历及其技术演进的记录，保留原始日期与文案。
const milestones = [
  { date: "2026-11-22", /* 历史日期 */ text: "resumeProjectHistoryV2", /* 历史文案标识 */ image: resumeV2, /* 版本截图 */ },
  { date: "2026-09-16", /* 历史日期 */ text: "resumeProjectHistoryDomain", /* 历史文案标识 */ },
  { date: "2026-08-15", /* 历史日期 */ text: "resumeProjectHistoryRelease", /* 历史文案标识 */ image: resumeV1, /* 版本截图 */ },
  { date: "2025-11-22", /* 历史日期 */ text: "resumeProjectHistoryStack", /* 历史文案标识 */ },
  { date: "2024-11-22", /* 历史日期 */ text: "resumeProjectHistoryBeta1", /* 历史文案标识 */ image: resumeBeta1, /* 版本截图 */ },
  { date: "2024-02-28", /* 历史日期 */ text: "resumeProjectHistoryBeta", /* 历史文案标识 */ url: "https://juejin.cn/post/7349433271493034034", /* 文章发布地址 */ image: resumeBeta, /* 早期截图 */ },
];

</script>

<template>
  <!-- 右侧预留悬浮入口宽度，窄屏内容自动换行，避免遮挡页尾文字。 -->
  <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-sf-b bg-sf-primary p-3 pr-[60px] text-sm text-sf-text-2">
    <div class="flex items-center gap-3">
      <SfLogo name="resume" size="6" />
      <div>
        <p class="font-semibold text-sf-text">{{ $t("core.router.resume") }}</p>
        <p class="text-xs">{{ $t("resumeProjectTagline") }}</p>
      </div>
    </div>
    <nav class="flex flex-wrap items-center gap-3" :aria-label="$t('resumeProjectLinks')">
      <!-- 页尾只保留一个入口，打开完整项目介绍。 -->
      <button type="button" class="cursor-pointer rounded-lg p-3 transition-colors hover:bg-sf-bg focus-visible:outline-sf-theme" @click="visible = true">{{ $t("resumeProjectAbout") }}</button>
      <span class="text-xs text-sf-text-3">{{ $t("resumeProjectSince") }}</span>
    </nav>
  </footer>

  <!-- 项目介绍与发展历程在同一滚动区域连续展示。 -->
  <SfModal v-model="visible" :title="$t('resumeProjectAbout')" title-class="justify-start! border-b border-sf-b pb-3 text-sm! font-medium! text-sf-text-2" width="640px">
    <div class="flex h-[min(580px,70vh)] min-h-0 flex-col text-sf-text">
      <SfScrollbar class="min-h-0 flex-1">
        <article class="flex flex-col gap-3 pb-3">
          <!-- 品牌区以浅主题底色聚焦标识与寄语，介绍正文保持轻量。 -->
          <header class="relative isolate overflow-hidden rounded-2xl bg-sf-theme-3 p-3">
            <span aria-hidden="true" class="pointer-events-none absolute -top-12 -right-12 -z-10 h-36 w-36 rounded-full border border-sf-theme-2"></span>
            <div class="flex items-center gap-3">
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sf-b bg-sf-primary">
                <SfLogo name="resume" size="8" />
              </span>
              <div>
                <h2 class="text-xl font-semibold tracking-tight">{{ $t("core.router.resume") }}</h2>
                <p class="text-xs text-sf-text-3">{{ $t("resumeProjectSince") }}</p>
              </div>
            </div>
            <p class="mt-3 text-sm font-medium leading-6 text-sf-theme">{{ $t("resumeProjectTagline") }}</p>
          </header>
          <p class="text-[13px] leading-6 text-sf-text-2">{{ $t("resumeProjectDescription") }}</p>
        </article>
        <div class="mb-3 flex items-center gap-3 pt-3">
          <h2 class="shrink-0 text-sm font-semibold">{{ $t("resumeProjectHistory") }}</h2>
          <span aria-hidden="true" class="h-px flex-1 bg-sf-b"></span>
        </div>
        <!-- 轻量时间轴以日期和节点区分记录，去掉重复卡片边框。 -->
        <ol class="pb-3">
          <li v-for="(item, index) in milestones" :key="item.date" class="group grid grid-cols-[12px_minmax(0,1fr)] gap-x-3">
            <div class="relative flex justify-center">
              <span v-if="index < milestones.length - 1" class="absolute top-3 bottom-0 w-px bg-sf-b"></span>
              <span class="relative mt-[3px] h-3 w-3 rounded-full border-[3px] border-sf-primary" :class="index === 0 ? 'bg-sf-theme ring-1 ring-sf-theme-2' : 'bg-sf-text-3'"></span>
            </div>
            <article class="min-w-0 pb-3">
              <time :datetime="item.date" class="block text-xs font-medium leading-[18px] tabular-nums" :class="index === 0 ? 'text-sf-theme' : 'text-sf-text-3'">{{ item.date }}</time>
              <p class="mt-[6px] text-[13px] leading-6 text-sf-text-2">{{ $t(item.text) }}</p>
              <!-- 文章与图片使用下划线文字入口，截图按需打开预览。 -->
              <div v-if="item.url || item.image" class="mt-3 flex flex-wrap items-center gap-3 text-xs text-sf-theme">
                <a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer" class="underline decoration-sf-theme-2 underline-offset-4 transition-colors hover:decoration-sf-theme focus-visible:outline-sf-theme">{{ $t("resumeProjectArticleUrl") }}</a>
                <button v-if="item.image" type="button" class="cursor-pointer underline decoration-sf-theme-2 underline-offset-4 transition-colors hover:decoration-sf-theme focus-visible:outline-sf-theme" @click="previewImage = item.image; previewVisible = true">{{ $t("resumeProjectViewImage") }}</button>
              </div>
            </article>
          </li>
        </ol>
        <p class="pb-3 text-center text-xs tracking-widest text-sf-text-3">{{ $t("resumeProjectContinued") }}</p>
      </SfScrollbar>
    </div>
  </SfModal>
  <el-image-viewer v-if="previewVisible" :url-list="[previewImage]" :z-index="3000" :close-on-press-escape="false" teleported @close="previewVisible = false" />
</template>
