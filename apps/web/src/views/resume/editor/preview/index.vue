<script setup>
// 简历页面渲染组件
import ResumePage from "./modes/page.vue";
// 缩放容器组件
import ScaleContainer from "./scaleContainer/index.vue";
import ResumeComments from "./resumeComments.vue";
import { useResumeStore, useSystemStore } from "@/stores";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useRuntimeData } from "../hooks/useRuntimeData";
// 全屏预览组件
const FullscreenPreview = markRaw(defineAsyncComponent(() => import("./modes/fullscreen.vue")));
const resumeStore = useResumeStore();
// 批注只在编辑预览中定位持有者，不进入纸张渲染和测量树。
const previewHost = ref(null);
const previewViewport = ref(null); // 移动端批注入口挂在未缩放的预览视口。
const previewScale = ref(1); // 当前纸张比例，用于保持批注的屏幕尺寸。
const commentsVisible = ref(true); // 本次编辑时是否展示批注，隐藏不删除批注内容。
const systemStore = useSystemStore();
// 隐藏内容时仍为添加按钮和数量保留入口列，触屏弹层不占纸张宽度。
const commentWidth = computed(() => systemStore.isMobile || !systemStore.canHover
  ? 0 : commentsVisible.value && resumeStore.currentComments.length ? 324 : 36);
const { currentData, currentConfig, currentUI, runtimeConfig, runtimeFields, previewSyncing } =
  storeToRefs(resumeStore);
const { markPreviewStart, markPreviewEnd } = useRuntimeData();
// 预览区加载开始：组件初始化即记录，作为预览区加载耗时起点
markPreviewStart();
// 预览区渲染完成（测量收口）时记录加载完成时间
watch(
  previewSyncing,
  (syncing) => {
    if (!syncing) markPreviewEnd();
  },
  { immediate: true },
);

// 组装全屏预览所需的简历项
const resumeItem = computed(() => ({
  data: currentData.value,
  // 编辑态优先使用运行时配置，与编辑预览保持同一配置来源
  config: runtimeConfig.value ?? currentConfig.value,
  ui: currentUI.value,
}));

const isFullscreen = ref(false);
const openFullscreen = () => {
  isFullscreen.value = true;
};
</script>

<template>
  <div ref="previewViewport" class="relative flex h-full min-w-0 flex-1 overflow-hidden">
    <ScaleContainer v-model:comments-visible="commentsVisible" class="min-w-0 flex-1" :comment-width="commentWidth" @scale-change="previewScale = $event" @fullscreen="openFullscreen">
      <!-- 纸张与页边批注共用缩放和滚动坐标，批注列位于纸张之外。 -->
      <div ref="previewHost" class="relative flex items-start gap-3">
        <div class="shrink-0"><ResumePage /></div>
      </div>
    </ScaleContainer>
    <!-- 批注独立于缩放画布挂载，仅桌面页边内容传送回纸张旁。 -->
    <ResumeComments v-if="previewHost" v-model:visible="commentsVisible" :root="previewHost" :viewport="previewViewport" :scale="previewScale" />
    <!-- 仅打开时挂载异步组件，避免编辑器初始化时提前加载全屏预览。 -->
    <FullscreenPreview
      v-if="isFullscreen"
      :visible="isFullscreen"
      :item="resumeItem"
      :expanded-fields="runtimeFields"
      @close="isFullscreen = false"
    />
  </div>
</template>

<style scoped></style>
