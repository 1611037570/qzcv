<script setup>
// 显式命名模板组件，供父级 KeepAlive 按 include 命中缓存
defineOptions({ name: "BuilderTemplate" });
import { useResumeStore } from "@/stores";
import { storeToRefs } from "pinia";
import ThumbPreview from "../../preview/modes/thumb.vue";
import ListScroll from "@/views/resume/components/listScroll.vue";
import { createResumeStyleUi, resumeStyleTemplateList } from "@/views/resume/theme";
import { loadResumeTemplateData } from "@/views/resume/template/data/resumeData";
import {
  resumeTemplateLayoutOptions,
  resumeTemplateTierOptions,
} from "@/views/resume/template/data/list";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import i18n, { $t } from "@/locales";
const resumeStore = useResumeStore();
const { currentUI } = storeToRefs(resumeStore);
const previewBase = ref(null);
const selectedLayout = ref(""); // 当前选中的布局标签
const selectedTier = ref(""); // 当前选中的设计类型，空值时不限类型
const visibleCount = ref(8);

// 布局和类型分别切换，可同时约束模板列表。
const toggleLayout = (key) => {
  selectedLayout.value = selectedLayout.value === key ? "" : key;
};
const toggleTier = (key) => {
  selectedTier.value = selectedTier.value === key ? "" : key;
};
// 筛选行配置：布局与类型两行共用同一渲染结构
const filterRows = computed(() => [
  {
    label: $t("resumeTemplateCategory_layout"), // 行首标签
    options: resumeTemplateLayoutOptions, // 布局选项
    selected: selectedLayout.value, // 当前选中项
    toggle: toggleLayout, // 点击切换函数
    withCount: false, // 是否展示模板数量
  },
  {
    label: $t("resumeTemplateCategory_tier"),
    options: resumeTemplateTierOptions,
    selected: selectedTier.value,
    toggle: toggleTier,
    withCount: true,
  },
]);
// 模板类型数量与模板页使用同一主题清单统计。
const getTemplateTypeCount = (key) =>
  resumeStyleTemplateList.filter((template) => template.design.includes(key)).length;

// 进入样式选择时再加载一份范本作为预览内容。
onMounted(async () => {
  try {
    previewBase.value = await loadResumeTemplateData("xiaoZhou.ts");
  } catch {
    ElMessage.error($t("previewLoadFailed"));
  }
});

// 模板清单与模板库共用真实主题列表。
const templates = computed(() => {
  // 读取当前语言以便语言切换时重新生成模板名称。
  if (!i18n.global.locale.value) return [];
  return resumeStyleTemplateList
    .filter((style) => {
      // 布局与类型两行同时选中时取交集，空选状态展示全部模板，不再屏蔽任何分类。
      return (
        (style.design.includes("all") ||
          !selectedLayout.value ||
          style.design.includes(selectedLayout.value)) &&
        (style.design.includes("all") ||
          !selectedTier.value ||
          style.design.includes(selectedTier.value))
      );
    })
    .map((style) => ({
      name: $t(`resumeTemplateStyle_${style.localeId}_name`),
      id: style.id,
      item: {
        data: previewBase.value?.data || {},
        config: previewBase.value?.config || {},
        ui: style.ui,
      },
    }));
});

// 编辑器模板分批展示，筛选变化后重新从首批开始。
const visibleTemplates = computed(() => templates.value.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < templates.value.length);
const filterKey = computed(() => `${selectedLayout.value}-${selectedTier.value}`);
watch(filterKey, () => {
  visibleCount.value = 8;
});
const loadNextTemplates = async () => {
  if (!hasMore.value) return false;
  await nextTick();
  visibleCount.value = Math.min(visibleCount.value + 8, templates.value.length);
  await nextTick();
  return true;
};

// 选中状态只由主题编号决定，复用相同标题样式的主题互不影响。
const isActive = (id) => (currentUI.value?.theme?.template ?? "default") === id;

// 应用风格：修改当前简历主题，预览层响应式渲染
const applyTemplate = (template) => {
  const moduleKeys = resumeStore.runtimeFields.map((field) => field.key).filter(Boolean);
  const { showFooter, footer, footerTemplate } = currentUI.value.page;
  // 切换外观保留展示语言，以及主题未指定的技能与荣誉模板选择。
  const ui = createResumeStyleUi(
    template.item.ui,
    moduleKeys,
    currentUI.value.content.language,
    currentUI.value.theme.skillTemplate,
    currentUI.value.honor.layout,
  );
  // 页尾属于简历自身设置，切换外观时保留显示状态、文案和页码样式。
  ui.page.showFooter = showFooter;
  ui.page.footer = footer;
  ui.page.footerTemplate = footerTemplate;
  currentUI.value = ui;
};
</script>

<template>
  <ListScroll
    class="h-full bg-sf-primary"
    content-class="py-3"
    :has-more="hasMore"
    :count="visibleTemplates.length"
    :load-more="loadNextTemplates"
    :reset-key="filterKey"
  >
    <!-- 布局与类型各占一行：标签固定在行首，选项行内横向滚动，不再撑开列表宽度 -->
    <div class="mb-3 flex flex-col gap-3">
      <div v-for="row in filterRows" :key="row.label" class="flex items-center gap-3">
        <span class="w-[36px] shrink-0 text-sm text-sf-text-2">{{ row.label }}</span>
        <div class="filter-row flex min-w-0 flex-1 flex-nowrap items-center gap-1.5">
          <button
            v-for="option in row.options"
            :key="option.key"
            type="button"
            class="h-7 shrink-0 cursor-pointer rounded-full px-3 text-xs whitespace-nowrap transition-colors"
            :class="
              row.selected === option.key
                ? 'bg-sf-theme font-medium text-sf-theme-text'
                : 'text-sf-text-2 hover:bg-sf-bg'
            "
            :aria-pressed="row.selected === option.key"
            @click="row.toggle(option.key)"
          >
            {{ $t(`resumeTemplateOption_design_${option.key}`) }}<span
              v-if="row.withCount"
            >（{{ getTemplateTypeCount(option.key) }}）</span>
          </button>
        </div>
      </div>
    </div>
    <!-- 模板卡片按可用宽度自动换列，保持缩略图的固定尺寸。 -->
    <div class="grid w-full grid-cols-[repeat(auto-fit,minmax(156px,1fr))] gap-3">
      <div
        v-for="template in visibleTemplates"
        :key="template.id"
        class="group cursor-pointer!"
        @click="applyTemplate(template)"
      >
        <!-- 模板缩略图外框与简历页面保持相同宽高比：宽度扣除 3px 描边，缩略图可用区正好是 A4 -->
        <div
          class="relative mx-auto box-content w-[150px] aspect-[794/1123] overflow-hidden rounded-[4px] border-3 border-sf-transparent bg-sf-bg"
          :class="{ ' border-sf-theme!': isActive(template.id) }"
        >
          <ThumbPreview :item="template.item" @select="applyTemplate(template)" />
          <div class="absolute top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2">
            <SfIcon
              v-if="isActive(template.id)"
              icon="lucide:check"
              size="18"
              class="text-sf-theme"
            />
          </div>
        </div>
        <div class="flex items-center justify-center pt-1">
          <span class="text-sm font-bold text-sf-text">{{ template.name }}</span>
        </div>
      </div>
    </div>
    <div
      v-if="!templates.length"
      class="flex h-36 items-center justify-center text-sm text-sf-text-2"
    >
      {{ $t("resumeTemplateEmpty") }}
    </div>
  </ListScroll>
</template>

<style lang="scss" scoped>
/* 筛选选项行内横向滚动：隐藏滚动条，触控板或按住滚轮横移，宽度不足时不撑开列表 */
.filter-row {
  overflow-x: auto;
  scrollbar-width: none;
}
.filter-row::-webkit-scrollbar {
  display: none;
}
</style>
