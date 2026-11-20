<script setup>
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useResumeStore } from "@/stores";
import { jumpEditor, jumpPreview } from "../../../hooks/useModuleNav";

// 移动端编辑标签顶部的模块横滑导航：只展示模块名称，点击定位编辑区与预览区
const resumeStore = useResumeStore();
const { runtimeConfig } = storeToRefs(resumeStore);

// 模块名称列表：顺序跟随运行时字段配置，隐藏模块灰阶展示但仍可点击定位
const moduleItems = computed(() =>
  (runtimeConfig.value?.fields || []).map((field) => ({
    key: field.key,
    name: resumeStore.getModel(field.key)?.name || field.key,
    // 隐藏模块在预览中不渲染，导航上降为灰阶作提示
    hidden: resumeStore.currentData?.[field.key]?.ui?.hidden === true,
  })),
);

// 当前高亮跟随编辑定位状态，编辑区内点击字段时导航同步
const editingModuleKey = computed(() => resumeStore.editingModuleKey);

// 点击模块：同步编辑定位状态并联动编辑区与预览区滚动
function handleModuleJump(key) {
  resumeStore.editingModuleKey = key;
  resumeStore.editingItemIndex = null;
  jumpEditor(key);
  jumpPreview(key);
}

// 筛选行滚轮横移：滚动条已隐藏，纵向滚轮与触控板横滑都能移动选项行
const onNavWheel = (event) => {
  const row = event.currentTarget;
  // 无横向溢出时不拦截，滚轮继续滚动表单本身
  if (!row || row.scrollWidth <= row.clientWidth) return;
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (!delta) return;
  event.preventDefault();
  row.scrollLeft += delta;
};
</script>

<template>
  <!-- 外层包装承载分割线与背景 -->
  <div class="shrink-0 border-b border-sf-bg-3 bg-sf-primary">
    <!-- 模块行内横向滚动：与模板面板筛选行同一实现，隐藏滚动条 -->
    <div
      class="module-nav-row flex flex-nowrap items-center gap-1.5 px-3 py-1.5"
      @wheel="onNavWheel"
    >
      <button
        v-for="item in moduleItems"
        :key="item.key"
        type="button"
        class="h-7 shrink-0 cursor-pointer rounded-full border px-2 text-[12px] whitespace-nowrap transition-colors select-none"
        :class="
          item.key === editingModuleKey
            ? 'border-sf-theme bg-sf-primary font-medium text-sf-text'
            : item.hidden
              ? 'border-sf-b bg-sf-primary text-sf-text-3 hover:border-sf-theme'
              : 'border-sf-b bg-sf-primary text-sf-text-2 hover:border-sf-theme hover:text-sf-text'
        "
        @click="handleModuleJump(item.key)"
      >
        {{ item.name }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 模块行内横向滚动：隐藏滚动条，触控板或按住滚轮横移，宽度不足时不撑开布局 */
.module-nav-row {
  overflow-x: auto;
  scrollbar-width: none;
}
.module-nav-row::-webkit-scrollbar {
  display: none;
}
</style>
