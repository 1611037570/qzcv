<script setup>
const props = defineProps({
  // AI 遮罩层默认关闭
  visible: { type: Boolean, default: false },
});

// AI 生成期间放行滚轮：把滚轮增量转发给预览滚动容器，遮罩继续拦截点击等其他交互。
const handleWheel = (event) => {
  const scrollbar = document.querySelector("[data-resume-preview-scroll]");
  const wrap = scrollbar?.querySelector(".el-scrollbar__wrap");
  if (!wrap) return;
  wrap.scrollTop += event.deltaY;
  wrap.scrollLeft += event.deltaX;
  event.preventDefault();
};
</script>

<template>
  <div
    v-if="props.visible"
    class="absolute inset-0 z-50 flex cursor-not-allowed items-center justify-center bg-sf-primary/[0.02] backdrop-blur-[0.2px]"
    @wheel="handleWheel"
  >
    <div
      class="absolute bottom-12 flex items-center gap-3 rounded-3xl border border-sf-theme-2 bg-sf-primary p-3 text-center"
    >
      <div class="flex items-center gap-1 text-sf-theme">
        <SfIcon icon="lucide:sparkles" size="4" class="" />
        <span class="text-sm font-semibold">{{ $t("editorMisc_aiBrand") }}</span>
      </div>
      <div class="text-xs text-sf-text-3">{{ $t("aiProcessing") }}</div>
      <SfIcon icon="ph:stop-circle-fill" size="7" class="text-sf-error" />
    </div>
  </div>
</template>

<style scoped></style>
