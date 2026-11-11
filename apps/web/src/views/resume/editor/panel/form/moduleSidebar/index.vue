<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useDraggable } from "vue-draggable-plus";
import { useResumeStore } from "@/stores";
import { moveFieldByKey } from "@/components/business/dynamicForm/api";
import { editorProgress, editorViewMode, jumpEditor, jumpPreview } from "../../../hooks/useModuleNav";
import { $t } from "@/locales";
import eventBus from "@/utils/modules/eventBus";
import AddModule from "./add.vue";
import ModuleProgress from "./progress/index.vue";
import MoreActions from "./moreActions.vue";
import ResumeClosing from "@/views/resume/components/resumeClosing.vue";

defineOptions({ name: "ModuleSidebar" });

// floating：移动端挂在工作区层的抽屉形态，默认收起；桌面端内联在编辑区，默认展开。
const props = defineProps({
  floating: {
    type: Boolean, // 是否为移动端抽屉形态
    default: false,
  },
});
const emit = defineEmits(["navigate"]);

// 抽屉收起状态：收起后整棵树滑出，布局宽度归零，由屏幕左缘浮层把手恢复
const collapsed = ref(props.floating);

// 编辑区展示模式：整页编辑在前且默认选中，单个模块只渲染当前点击的模块
const VIEW_MODES = [
  { value: "page", label: "pageEditMode", icon: "mdi:file-document-outline" },
  { value: "single", label: "singleModuleMode", icon: "lucide:layout-template" },
];

// 模块名称最多显示的字数，超出截断，保证模块树宽度稳定
const NAME_MAX = 6;
// 模块树当前高亮项：进入时默认个人信息，之后只由点击决定
const activeKey = ref("user");

const resumeStore = useResumeStore();
const { runtimeConfig, system } = storeToRefs(resumeStore);
const listRef = ref(null);
const draggableItems = ref([]);
let draggedKeys = [];
let draggable = null;

// 名称超过上限时截断并补省略号，让「还有内容」看得出来
const shortName = (name) =>
  name.length > NAME_MAX ? `${name.slice(0, NAME_MAX)}…` : name;

// 点击模块树同步定位编辑区与预览区；抽屉形态下选中后收起，并通知工作区切回编辑面板
function handleModuleJump(key) {
  activeKey.value = key;
  resumeStore.editingModuleKey = key;
  resumeStore.editingItemIndex = null;
  jumpEditor(key);
  jumpPreview(key);
  if (props.floating) {
    collapsed.value = true;
    emit("navigate");
  }
}

// 完成度卡片等入口的跳转：抽屉形态下收起并通知工作区切回编辑面板
function handleNavigate() {
  if (!props.floating) return;
  collapsed.value = true;
  emit("navigate");
}

// 左侧展示全部模块名称，同时带上隐藏状态与记录数量
const moduleItems = computed(() =>
  (runtimeConfig.value?.fields || []).map((field) => {
    const records = resumeStore.currentData?.[field.key]?.list;
    return {
      key: field.key,
      name: resumeStore.getModel(field.key)?.name || field.key,
      fixed: field.fixed,
      // 隐藏模块在模块树中降为灰阶并显示圆点
      hidden: resumeStore.currentData?.[field.key]?.ui?.hidden === true,
      // 记录数量：对象模块没有记录，返回 null 时不展示
      count: Array.isArray(records) ? records.length : null,
    };
  }),
);

// 各模块必填项是否全部填写：与完成度详情同一口径，勾选圈与行尾文案按此区分
const moduleDoneMap = computed(() => {
  // Map 的键为模块标识，值为该模块必填项是否全部完成
  const map = new Map();
  editorProgress.value.list.forEach((item) => {
    map.set(item.key, item.progress >= 100);
  });
  return map;
});

// 模块行状态样式：选中高亮优先，隐藏降灰，其余默认悬停反馈
const rowClass = (item) => {
  if (item.key === activeKey.value) return "bg-sf-theme-3 text-sf-theme";
  if (item.hidden) return "text-sf-text-3";
  return "text-sf-text hover:bg-sf-bg";
};

// 勾选圈状态样式：隐藏降灰，完成用成功色，未完成用警示色
const checkClass = (item) => {
  if (item.hidden) return "text-sf-text-3";
  return moduleDoneMap.value.get(item.key) ? "text-sf-success" : "text-sf-warning";
};

// 待补充文案样式：随模块行一起降灰
const pendingClass = (item) => (item.hidden ? "text-sf-text-3" : "text-sf-warning");

// 待补充点击：打开完成度详情，用户可直接看到该模块缺了哪些必填项
const openProgressDetail = () => {
  eventBus.emit("open-progress-detail");
};

// 待补充原因提示：只对未完成模块生成，悬停「待补充」可看到还差几处必填项
const moduleTipMap = computed(() => {
  const map = new Map();
  editorProgress.value.list.forEach((item) => {
    // 只统计缺失类问题，格式与时间线问题在完成度详情中查看
    const missing = item.issues.filter((issue) => issue.kind === "missing").length;
    if (missing > 0) {
      map.set(item.key, $t("moduleProgressTip", { progress: item.progress, count: missing }));
    }
  });
  return map;
});

// 表单进入模块编辑状态时，同步更新模块树高亮项。
watch(
  () => resumeStore.editingModuleKey,
  (key) => {
    if (!key || !moduleItems.value.some((item) => item.key === key)) return;
    activeKey.value = key;
  },
);

watch(
  moduleItems,
  (items) => {
    draggableItems.value = [...items];
  },
  { immediate: true },
);

onMounted(async () => {
  await nextTick();
  // 模块拖拽沿用动态表单效果，并将顺序写回运行时字段配置
  draggable = useDraggable(listRef, draggableItems, {
    animation: 300,
    easing: "cubic-bezier(.2, .8, .2, 1)",
    ghostClass: "module-sidebar-ghost",
    handle: ".module-sidebar-drag",
    forceFallback: true,
    fallbackClass: "module-sidebar-drag-fallback",
    fallbackOnBody: true,
    onMove: (event) => !event.related?.dataset?.fixed,
    onStart: () => {
      draggedKeys = draggableItems.value.map((item) => item.key);
    },
    onEnd: (event) => {
      const fromKey = draggedKeys[event.oldIndex];
      const toKey = draggedKeys[event.newIndex];
      if (fromKey && toKey) {
        moveFieldByKey(
          runtimeConfig.value?.fields || [],
          fromKey,
          toKey,
          event.oldIndex < event.newIndex ? "after" : "before",
        );
      }
    },
  });
});

onUnmounted(() => {
  draggable?.destroy();
  draggable = null;
});
</script>

<template>
  <!-- 抽屉容器：展开时占位模块树宽度，收起后完全不占据布局宽度，把手以浮层形式挂在屏幕左缘 -->
  <div
    class="module-tree-root relative shrink-0"
    :class="[floating ? 'fixed inset-y-0 left-0 z-50' : 'h-full', { 'module-tree-collapsed': collapsed }]"
  >
    <!-- 移动端抽屉展开时的遮罩：点击空白区域收起，与右侧工具栏一致 -->
    <div
      v-if="floating && !collapsed"
      class="fixed inset-0 z-40 bg-sf-text"
      style="opacity: 0.2"
      @click="collapsed = true"
    />
    <!-- 滑块：模块树整体滑动，收起后完全滑出屏幕 -->
    <div class="module-tree-slider absolute inset-y-0 left-0 z-50">
      <aside class="module-tree flex h-full min-h-0 min-w-0 flex-col bg-sf-primary p-1.5" :class="floating ? 'shadow-xl' : ''">
        <!-- 完成度：模块树最上方，随简历内容实时更新 -->
        <ModuleProgress @navigate="handleNavigate" />
        <!-- 模块标题行：左侧标题与拖动排序提示，右侧收起入口合并为一行 -->
        <div class="flex items-center gap-1 px-1 pb-1.5 text-xs text-sf-text">
          <span class="font-medium">{{ $t("resumeModuleTitle") }}</span>
          <span>· {{ $t("dragSortHint") }}</span>
          <SfTooltip :content="$t('collapseModuleTree')" placement="bottom" class="ml-auto block shrink-0">
            <button
              type="button"
              class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-3xl p-0 text-sf-text-2 transition-colors hover:bg-sf-bg"
              :aria-label="$t('collapseModuleTree')"
              @click="collapsed = true"
            >
              <SfIcon icon="mdi:chevron-left" size="4" />
            </button>
          </SfTooltip>
        </div>
        <!-- 编辑区展示切换：样式与编辑 AI 模板标签一致 -->
        <div
          class="flex h-8 shrink-0 items-center rounded-3xl border border-sf-b bg-sf-bg p-1 transition-colors hover:border-sf-theme"
          role="tablist"
          :aria-label="$t('moduleNavigation')"
        >
          <button
            v-for="mode in VIEW_MODES"
            :key="mode.value"
            type="button"
            role="tab"
            class="flex h-6 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-2xl px-1 text-[12px] transition-all duration-100 select-none"
            :class="
              editorViewMode === mode.value
                ? 'bg-sf-theme font-medium text-sf-theme-text'
                : 'text-sf-text hover:bg-sf-theme-2'
            "
            :aria-selected="editorViewMode === mode.value"
            @click="editorViewMode = mode.value"
          >
            <SfIcon :icon="mode.icon" size="4" class="shrink-0" />
            <span class="truncate">{{ $t(mode.label) }}</span>
          </button>
        </div>
        <SfScrollbar class="module-list-scroll mt-1.5 min-h-0 min-w-0 flex-1">
          <!-- 模块行固定高度，名称最多显示六个字，正常状态使用主文字色 -->
          <div ref="listRef" class="flex min-h-full shrink-0 flex-col gap-1.5">
            <!-- 模块行固定高度，名称最多显示六个字，正常状态使用主文字色 -->
            <div
              v-for="item in draggableItems"
              :key="item.key"
              :data-fixed="item.fixed ? 'true' : undefined"
              class="rail-row group/rail flex h-8 min-w-0 cursor-pointer items-center gap-1 rounded-3xl p-1 transition-colors select-none"
              :class="rowClass(item)"
              @click="handleModuleJump(item.key)"
            >
              <!-- 左侧完成状态勾选圈：必填项填完显示成功色对勾，未填完显示警示色空心圈 -->
              <SfIcon
                :icon="moduleDoneMap.get(item.key) ? 'mdi:check-circle' : 'mdi:circle-outline'"
                size="4"
                class="shrink-0 transition-colors"
                :class="checkClass(item)"
              />
              <span class="module-name max-w-21 truncate text-[12px]">{{ shortName(item.name) }}</span>
              <!-- 右侧为完成状态与拖拽把手：未完成显示待补充，完成后显示数量徽标，两者互斥 -->
              <span class="rail-meta ml-auto flex shrink-0 items-center gap-1">
                <span v-if="item.hidden" class="h-1.5 w-1.5 rounded-full bg-sf-text-3"></span>
                <!-- 待补充仅未完成时渲染（SfTooltip 默认插槽为空会兜底出问号图标，故完成态不包 tooltip）；
                     悬停可看到还差几处必填项，点击直接打开完成度详情 -->
                <SfTooltip
                  v-if="!moduleDoneMap.get(item.key)"
                  :content="moduleTipMap.get(item.key)"
                  placement="top"
                  class="flex min-w-0 items-center"
                >
                  <button
                    type="button"
                    class="flex h-6 cursor-pointer items-center rounded-3xl px-1 text-[11px] leading-none transition-colors hover:underline"
                    :class="pendingClass(item)"
                    @click.stop="openProgressDetail"
                  >{{ $t("toBeFilled") }}</button>
                </SfTooltip>
                <!-- 完成后的记录数量徽标，不加悬停提示 -->
                <span
                  v-else-if="item.count !== null"
                  class="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-none tabular-nums"
                  :class="
                    item.key === activeKey
                      ? 'bg-sf-theme text-sf-theme-text'
                      : 'bg-sf-bg-2 text-sf-text-3'
                  "
                  >{{ item.count }}</span
                >
                <span
                  v-if="!item.fixed"
                  class="module-sidebar-drag flex cursor-grab! items-center active:cursor-grabbing!"
                  @click.stop
                >
                  <!-- 图标组件自身带 cursor-pointer，抓手光标必须加感叹号才生效 -->
                  <SfIcon
                    icon="icon-park-outline:drag"
                    size="4"
                    class="cursor-grab! text-sf-text-3 active:cursor-grabbing!"
                  />
                </span>
              </span>
            </div>
          </div>
        </SfScrollbar>
        <!-- 底部操作与模块行、寄语统一使用主文字色 -->
        <div class="flex shrink-0 flex-col gap-1.5 border-t border-sf-b pt-1.5">
          <button
            v-if="system.moreOperationsExpanded"
            type="button"
            class="rail-action flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-3xl p-1 text-[12px] text-sf-text transition-colors select-none hover:bg-sf-bg"
            aria-expanded="true"
            @click="system.moreOperationsExpanded = false"
          >
            <SfIcon icon="fa-solid:caret-up" size="4" />
            <span>{{ $t("collapseSidebarMore") }}</span>
          </button>
          <button
            v-else
            type="button"
            class="rail-action flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-3xl p-1 text-[12px] text-sf-text transition-colors select-none hover:bg-sf-bg"
            aria-expanded="false"
            @click="system.moreOperationsExpanded = true"
          >
            <SfIcon icon="fa-solid:caret-down" size="4" />
            <span>{{ $t("expandSidebarMore") }}</span>
          </button>
          <div v-if="system.moreOperationsExpanded" class="max-h-[50vh] min-h-0 overflow-y-auto">
            <MoreActions />
          </div>
          <SfDropdown
            v-else
            trigger="click"
            placement="right-end"
            :show-arrow="false"
            class="w-full"
          >
            <button
              type="button"
              class="rail-action flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-3xl p-1 text-[12px] text-sf-text transition-colors select-none hover:bg-sf-bg"
              aria-haspopup="menu"
            >
              <SfIcon icon="mdi:dots-horizontal" size="4" />
              <span>{{ $t("moreOperations") }}</span>
            </button>
            <template #dropdown>
              <div class="flex w-40 flex-col gap-1.5 rounded-2xl border border-sf-b bg-sf-primary p-1.5">
                <MoreActions />
              </div>
            </template>
          </SfDropdown>
          <AddModule />
        </div>
        <!-- 收尾文案覆盖共用组件的辅助色 -->
        <ResumeClosing
          class="shrink-0 border-t border-sf-b px-1 pt-1.5 text-center text-[11px] leading-4 text-sf-text!"
        />
      </aside>
    </div>
    <!-- 左缘把手：绝对定位浮层，展开时隐藏，收起后才出现，不占据任何布局宽度 -->
    <SfTooltip :content="$t('expandModuleTree')" placement="right" class="absolute left-0 top-1/2 z-50 -translate-y-1/2">
      <button
        type="button"
        class="flex h-12 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-r-2xl border border-l-0 border-sf-b bg-sf-primary text-sf-text-2 transition-all duration-300 hover:text-sf-theme"
        :class="collapsed ? 'opacity-100' : 'pointer-events-none opacity-0'"
        :aria-hidden="!collapsed"
        :aria-label="$t('expandModuleTree')"
        tabindex="-1"
        @click="collapsed = false"
      >
        <SfIcon icon="mdi:chevron-right" size="4" />
      </button>
    </SfTooltip>
  </div>
</template>

<style lang="scss" scoped>
/* 抽屉容器：移动端与桌面端固定同一宽度，宽度全部由变量统一管理 */
.module-tree-root {
  --module-tree-width: 184px; /* 模块树固定宽度 */

  width: var(--module-tree-width);
  transition: width 0.3s ease-out;
}

.module-tree-collapsed {
  width: 0;
}

/* 滑块收起时整树滑出屏幕左侧 */
.module-tree-slider {
  transition: transform 0.3s ease-out;
  will-change: transform;
}

.module-tree-collapsed .module-tree-slider {
  transform: translateX(-100%);
}

/* 模块树为勾选圈 + 名称列表，拖拽把手固定在行尾 */
.module-tree {
  width: var(--module-tree-width);
}

.module-list-scroll {
  :deep(.el-scrollbar__view) {
    /* 模块树左右留白与上下间距保持一致 */
    padding: 0 !important;
  }
}

.module-sidebar-ghost {
  opacity: 0;
}

/* 跟手拖拽的克隆体：圆角与模块行一致 */
.module-sidebar-drag-fallback {
  transform: scale(1.03);
  border-radius: 24px;
  opacity: 1 !important;
  box-shadow: 0 14px 30px rgba(17, 24, 39, 0.18);
}
</style>
