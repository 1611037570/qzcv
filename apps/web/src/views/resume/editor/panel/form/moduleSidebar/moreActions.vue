<script setup>
import { defineAsyncComponent, ref } from "vue";
import ModuleSearch from "./moduleSearch/index.vue";
import SortByTime from "./sortByTime.vue";

// 导入弹窗在操作列表出现时加载。
const ImportResume = defineAsyncComponent(() => import("@/views/resume/mine/components/importResume.vue"));
// 学习中心按需加载，浏览指引不打断编辑。
const LearningCenterModal = defineAsyncComponent(
  () => import("@/views/resume/editor/components/header/learningCenter/learningCenterModal.vue"),
);
// 学习中心弹窗显隐
const learningVisible = ref(false);
</script>

<template>
  <!-- 展开列表与折叠后的下拉菜单共用相同操作，行规格及主文字色与模块树一致。 -->
  <div class="flex flex-col gap-1.5">
    <ImportResume jump-after-import>
      <template #trigger="{ open }">
        <button
          type="button"
          class="rail-action flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-3xl p-1 text-[12px] text-sf-text transition-colors select-none hover:bg-sf-bg"
          @click="open"
        >
          <SfIcon icon="fa6-solid:file-import" size="4" />
          <span>{{ $t("resumeImportResume") }}</span>
        </button>
      </template>
    </ImportResume>
    <button
      type="button"
      class="rail-action flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-3xl p-1 text-[12px] text-sf-text transition-colors select-none hover:bg-sf-bg"
      @click="learningVisible = true"
    >
      <SfIcon icon="mdi:book-open-page-variant" size="4" />
      <span>{{ $t("learningCenterTitle") }}</span>
    </button>
    <ModuleSearch />
    <SortByTime />
    <LearningCenterModal v-if="learningVisible" v-model="learningVisible" />
  </div>
</template>
