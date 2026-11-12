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
// 批注显隐与缩放状态属于简历自己的使用信息，初始化时从当前简历读取。
const commentsVisible = ref(resumeStore.currentUsage?.commentsVisible ?? true); // 本次编辑时是否展示批注，隐藏不删除批注内容。
const scaleMode = ref(resumeStore.currentUsage?.scaleMode ?? "onePage"); // 缩放模式
const manualScale = ref(resumeStore.currentUsage?.manualScale ?? 1); // 手动缩放比例
const currentUsage = computed(() => resumeStore.currentUsage);
// 切换简历时恢复该简历上次保存的预览状态
watch(currentUsage, (usage) => {
  commentsVisible.value = usage?.commentsVisible ?? true;
  scaleMode.value = usage?.scaleMode ?? "onePage";
  manualScale.value = usage?.manualScale ?? 1;
});
// 状态变化写回当前简历，由 store 的深层监听统一排队持久化
watch([commentsVisible, scaleMode, manualScale], ([visible, mode, scale]) => {
  const usage = currentUsage.value;
  if (!usage) return;
  // 与已保存值一致时不写回，避免切换简历时反复触发保存
  if (usage.commentsVisible === visible && usage.scaleMode === mode && usage.manualScale === scale) return;
  resumeStore.currentUsage = { commentsVisible: visible, scaleMode: mode, manualScale: scale };
});
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
    <ScaleContainer v-model:comments-visible="commentsVisible" v-model:scale-mode="scaleMode" v-model:manual-scale="manualScale" class="min-w-0 flex-1" :comment-width="commentWidth" @scale-change="previewScale = $event" @fullscreen="openFullscreen">
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
