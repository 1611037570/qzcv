<script setup>
// 模板抽屉：入口按钮位于预览工具栏，面板以 fixed 浮层从屏幕最左缘滑出
import { computed, defineAsyncComponent, ref } from "vue";
import { storeToRefs } from "pinia";
import { $t } from "@/locales";
import { useResumeStore, useSystemStore } from "@/stores";

// 模板面板沿用原标签页组件，打开时才异步加载
const AsyncTemplate = defineAsyncComponent(() => import("../../../panel/template/index.vue"));

const resumeStore = useResumeStore();
const { editorWidth } = storeToRefs(resumeStore);
const { isMobile } = storeToRefs(useSystemStore());

// 抽屉显隐
const visible = ref(false);

// 抽屉宽度与左侧编辑区一致，移动端占满预览区
const drawerStyle = computed(() => ({
  width: isMobile.value ? "100%" : `${editorWidth.value}px`,
}));
</script>

<template>
  <SfTooltip :content="$t('template')">
    <button
      type="button"
      class="flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[11px] transition-colors"
      :class="visible ? 'bg-sf-theme-2 text-sf-theme' : 'text-sf-text-2 hover:bg-sf-bg'"
      :aria-pressed="visible"
      @click="visible = true"
    >
      <SfIcon icon="lucide:layout-template" size="4" />
      <span class="whitespace-nowrap">{{ $t("template") }}</span>
    </button>
  </SfTooltip>
  <!-- 抽屉浮层：fixed 相对视口，从屏幕最左缘滑出（与模块树抽屉同款），移动端也可用 -->
  <!-- 遮罩在抽屉打开期间常驻：点击空白收起；全屏预览层级更高，不受遮罩影响 -->
  <Transition name="template-drawer-mask">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 bg-sf-text"
      style="opacity: 0.2"
      @click="visible = false"
    />
  </Transition>
  <Transition name="template-drawer">
    <div
      v-if="visible"
      class="fixed inset-y-0 left-0 z-50"
      :style="drawerStyle"
    >
      <div class="flex h-full min-h-0 flex-col border-r border-sf-b bg-sf-primary shadow-xl">
        <!-- 顶部栏：标题与关闭入口独立于模板列表，浮层按钮与卡片热区不再重叠 -->
        <div class="flex h-12 shrink-0 items-center justify-between px-4">
          <span class="text-sm font-medium text-sf-text">{{ $t("template") }}</span>
          <button
            type="button"
            class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sf-text transition-colors hover:bg-sf-bg-2"
            :aria-label="$t('template')"
            @click="visible = false"
          >
            <SfIcon icon="lucide:x" size="4" />
          </button>
        </div>
        <AsyncTemplate class="min-h-0 w-full flex-1" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 抽屉滑入滑出：从屏幕最左缘平移 */
.template-drawer-enter-active,
.template-drawer-leave-active {
  transition: transform 0.3s ease-out;
}

.template-drawer-enter-from,
.template-drawer-leave-to {
  transform: translateX(-100%);
}

/* 遮罩淡入淡出 */
.template-drawer-mask-enter-active,
.template-drawer-mask-leave-active {
  transition: opacity 0.3s ease-out;
}

.template-drawer-mask-enter-from,
.template-drawer-mask-leave-to {
  opacity: 0 !important;
}
</style>
