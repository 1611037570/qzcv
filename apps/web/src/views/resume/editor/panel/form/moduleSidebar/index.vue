<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useDraggable } from "vue-draggable-plus";
import { useResumeStore } from "@/stores";
import { moveFieldByKey } from "@/components/business/dynamicForm/api";
import {
  CUSTOM_MODULE_ICON,
  DEFAULT_MODULE_NAMES,
} from "@/stores/modules/resume/config/defaultConfig";
import {
  editorProgress,
  jumpEditor,
  jumpPreview,
  jumpToCheckTarget,
} from "../../../hooks/useModuleNav";
import { $t } from "@/locales";
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

// 模块图标映射：默认模块取登记表，自定义模块统一使用拼图图标
const MODULE_ICON_MAP = new Map(DEFAULT_MODULE_NAMES.map(({ key, icon }) => [key, icon]));
// 模块树当前高亮项：进入时默认个人信息，之后只由点击决定
const activeKey = ref("user");

const resumeStore = useResumeStore();
const { runtimeConfig, system } = storeToRefs(resumeStore);
// 确认弹窗与模块折叠面板同源，走全局 $confirm
const { proxy } = getCurrentInstance();
const listRef = ref(null);
const draggableItems = ref([]);
let draggedKeys = [];
let draggable = null;

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
      // 图标随模块登记表展示，自定义模块沿用拼图图标
      icon:
        MODULE_ICON_MAP.get(field.key) ||
        (field.key.startsWith("custom") ? CUSTOM_MODULE_ICON : "mdi:puzzle-outline"),
      fixed: field.fixed,
      // 隐藏模块在模块树中降为灰阶并显示圆点
      hidden: resumeStore.currentData?.[field.key]?.ui?.hidden === true,
      // 记录数量：对象模块没有记录，返回 null 时不展示
      count: Array.isArray(records) ? records.length : null,
    };
  }),
);

// 各模块必填项是否全部填写：与完成度详情同一口径，图标角标与状态文案按此区分
const moduleDoneMap = computed(() => {
  // Map 的键为模块标识，值为该模块必填项是否全部完成
  const map = new Map();
  editorProgress.value.list.forEach((item) => {
    map.set(item.key, item.progress >= 100);
  });
  return map;
});

// 模块卡片状态样式：选中与悬停只做边框反馈，隐藏模块整体降灰
const rowClass = (item) => {
  if (item.key === activeKey.value) return "border-sf-theme font-medium text-sf-text";
  if (item.hidden) return "border-sf-b text-sf-text-3 opacity-70";
  return "border-sf-b text-sf-text hover:border-sf-theme";
};

// 图标底板：选中填充主题色，隐藏降为灰底，其余使用主题浅色底
const iconBoxClass = (item) => {
  if (item.hidden) return "bg-sf-bg text-sf-text-3";
  if (item.key === activeKey.value) return "bg-sf-theme text-sf-theme-text";
  return "bg-sf-theme-3 text-sf-theme";
};

// 右下角状态角标：隐藏显示灰底，必填完成显示成功色，未完成显示警示色
const badgeClass = (item) => {
  if (item.hidden) return "bg-sf-bg-2 text-sf-text-3";
  return moduleDoneMap.value.get(item.key)
    ? "bg-sf-success text-sf-theme-text"
    : "bg-sf-warning text-sf-theme-text";
};

// 角标图标：隐藏为闭眼，完成为对勾，未完成为警示提示
const badgeIcon = (item) => {
  if (item.hidden) return "lucide:eye-off";
  return moduleDoneMap.value.get(item.key) ? "lucide:check" : "lucide:circle-alert";
};

// 待补充文案样式：随模块行一起降灰
const pendingClass = (item) => (item.hidden ? "text-sf-text-3" : "text-sf-warning");

// 待补充提示与定位目标：悬停解释还差几处必填项，点击直接跳到第一个缺失字段
const pendingModuleMap = computed(() => {
  const map = new Map();
  editorProgress.value.list.forEach((item) => {
    // 只统计缺失类问题，格式与时间线问题在完成度详情中查看
    const missing = item.issues.filter((issue) => issue.kind === "missing");
    if (!missing.length) return;
    map.set(item.key, {
      tip: $t("moduleProgressTip", { progress: item.progress, count: missing.length }),
      target: missing[0].target, // 第一个缺失必填项的编辑位置
    });
  });
  return map;
});

// 待补充点击：直接定位到第一个缺失的必填项，省去打开详情弹窗再跳转的一步
function goFillMissing(key) {
  const target = pendingModuleMap.value.get(key)?.target;
  if (!target || !jumpToCheckTarget(target)) return;
  // 抽屉形态下定位成功后收起并切回编辑面板
  handleNavigate();
}

// 删除模块：与模块折叠面板共用确认文案与删除流程
function delModule(item) {
  const message =
    item.key === "jobIntent"
      ? $t("deleteJobIntentConfirm")
      : $t("deleteModuleConfirm", {
          name: resumeStore.currentData?.[item.key]?.ui?.title || item.name,
        });
  proxy.$confirm(message, $t("deleteConfirm")).then(() => {
    resumeStore.removeModule(item.key);
  });
}

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
  <!-- 抽屉容器：桌面端占位模块树宽度，移动端 fixed 全高浮层；收起后宽度归零，把手以浮层形式挂在屏幕左缘 -->
  <!-- 注意：relative 不能放在静态 class，否则 Tailwind 规则顺序会覆盖 floating 的 fixed，导致抽屉无法全高 -->
  <div
    class="module-tree-root"
    :class="[
      floating
        ? `fixed inset-y-0 left-0 ${collapsed ? 'z-50' : 'z-60'}`
        : 'relative h-full shrink-0',
      { 'module-tree-collapsed': collapsed },
    ]"
  >
    <!-- 移动端抽屉展开时的遮罩：点击空白区域收起，与右侧工具栏一致 -->
    <div
      v-if="floating && !collapsed"
      class="fixed inset-0 z-40 bg-sf-text"
      style="opacity: 0.2"
      @click="collapsed = true"
    />
    <!-- 滑块：模块树整体滑动，收起后完全滑出屏幕；桌面端留在编辑面板内，不覆盖顶部栏头 -->
    <div class="module-tree-slider absolute inset-y-0 left-0 z-50">
      <aside
        class="module-tree flex h-full min-h-0 min-w-0 flex-col bg-sf-primary p-1.5"
        :class="floating ? 'shadow-xl' : ''"
      >
        <!-- 完成度：模块树最上方，随简历内容实时更新 -->
        <ModuleProgress @navigate="handleNavigate" />
        <!-- 模块标题行：左侧标题与拖动排序提示，右侧收起入口合并为一行 -->
        <div class="flex items-center gap-1 px-1 pb-1.5 text-xs text-sf-text">
          <span class="font-medium">{{ $t("resumeModuleTitle") }}</span>
          <span>· {{ $t("dragSortHint") }}</span>
          <SfTooltip
            :content="$t('collapseModuleTree')"
            placement="bottom"
            class="ml-auto block shrink-0"
          >
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
        <!-- 负右边距抵消外层内边距，让滚动条贴住面板右边缘 -->
        <SfScrollbar class="module-list-scroll -mr-1.5 min-h-0 min-w-0 flex-1">
          <!-- 模块列表：卡片式模块行，名称超长截断，保证窄栏宽度稳定 -->
          <div ref="listRef" class="flex min-h-full shrink-0 flex-col gap-3 pr-1.5 pb-3">
            <!-- 模块卡片：最左侧拖拽把手，其次为带状态角标的模块图标，右侧为名称与状态文案 -->
            <div
              v-for="item in draggableItems"
              :key="item.key"
              :data-fixed="item.fixed ? 'true' : undefined"
              class="rail-row group/rail flex min-w-0 cursor-pointer items-center gap-1.5 rounded-2xl border bg-sf-primary p-2 transition-colors select-none"
              :class="rowClass(item)"
              @click="handleModuleJump(item.key)"
            >
              <!-- 模块图标与右下角状态角标：角标外圈用卡片底色，与图标底板分隔 -->
              <span
                class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl transition-colors"
                :class="iconBoxClass(item)"
              >
                <SfIcon :icon="item.icon" size="5" />
                <!-- 状态角标直接用图标盒子承载外圈，避免额外包裹层 -->
                <SfIcon
                  :icon="badgeIcon(item)"
                  size="3.5"
                  box-size="3"
                  class="absolute! -right-0.5 -bottom-0.5 rounded-full ring-1 ring-sf-primary"
                  :class="badgeClass(item)"
                  aria-hidden="true"
                />
              </span>
              <!-- 名称与状态文案：未完成显示待补充，完成后显示记录数量，两者互斥 -->
              <span class="flex min-w-0 flex-1 flex-col justify-center">
                <span class="truncate text-[13px] leading-4">{{ item.name }}</span>
                <!-- 待补充仅未完成时渲染（SfTooltip 默认插槽为空会兜底出问号图标，故完成态不包 tooltip）；
                     悬停可看到还差几处必填项，点击直接定位到第一个缺失字段 -->
                <SfTooltip
                  v-if="!moduleDoneMap.get(item.key)"
                  :content="pendingModuleMap.get(item.key)?.tip"
                  placement="top"
                  class="mt-1 flex min-w-0 items-center"
                >
                  <button
                    type="button"
                    class="flex cursor-pointer items-center text-[11px] leading-3 transition-colors hover:underline"
                    :class="pendingClass(item)"
                    @click.stop="goFillMissing(item.key)"
                  >
                    {{ $t("toBeFilled") }}
                  </button>
                </SfTooltip>
                <!-- 完成后的记录数量，跟随名称下方展示 -->
                <span
                  v-else-if="item.count !== null"
                  class="mt-1 truncate text-[11px] leading-3 text-sf-text-2"
                  >{{ $t("moduleRecordCount", { count: item.count }) }}</span
                >
              </span>
              <!-- 行尾操作：拖拽把手排在最前，后接隐藏/显示与删除 -->
              <span class="ml-1.5 flex shrink-0 items-center gap-1">
                <!-- 拖拽把手：位于右侧操作区的第一个位置，图标样式与显隐、删除保持一致 -->
                <span
                  v-if="!item.fixed"
                  class="module-sidebar-drag flex cursor-grab! items-center active:cursor-grabbing!"
                  @click.stop
                >
                  <!-- 图标组件自身带 cursor-pointer，抓手光标必须加感叹号才生效 -->
                  <SfIcon
                    icon="icon-park-outline:drag"
                    size="4"
                    class="cursor-grab! text-sf-text-3 transition-colors hover:text-sf-text active:cursor-grabbing!"
                  />
                </span>
                <SfTooltip :content="item.hidden ? $t('show') : $t('hide')" placement="top">
                  <button
                    type="button"
                    class="flex cursor-pointer items-center"
                    @click.stop="resumeStore.setModuleHidden(item.key, !item.hidden)"
                  >
                    <SfIcon
                      :icon="item.hidden ? 'lucide:eye' : 'lucide:eye-off'"
                      size="4"
                      class="text-sf-text-3 transition-colors hover:text-sf-text"
                    />
                  </button>
                </SfTooltip>
                <!-- 删除模块：固定模块不可删，确认流程与模块折叠面板一致 -->
                <SfTooltip v-if="!item.fixed" :content="$t('delete')" placement="top">
                  <button
                    type="button"
                    class="flex cursor-pointer items-center"
                    @click.stop="delModule(item)"
                  >
                    <SfIcon
                      icon="ic:round-delete"
                      size="4"
                      class="text-sf-text-3 transition-colors hover:text-sf-text"
                    />
                  </button>
                </SfTooltip>
              </span>
            </div>
          </div>
        </SfScrollbar>
        <!-- 底部操作与上方模块列表用分割线隔开，操作区自成一块 -->
        <div class="flex shrink-0 flex-col gap-1.5 border-t border-sf-b py-1.5">
          <!-- 添加模块紧邻模块列表，展开更多与更多操作排在其后 -->
          <AddModule />
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
          <!-- 更多操作高度随内容，超出后滚动；滚动区域统一交给 SfScrollbar -->
          <SfScrollbar
            v-if="system.moreOperationsExpanded"
            max-height="50vh"
            flush
            class="h-auto! flex-none!"
          >
            <MoreActions />
          </SfScrollbar>
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
              <div
                class="flex w-40 flex-col gap-1.5 rounded-2xl border border-sf-b bg-sf-primary p-1.5"
              >
                <MoreActions />
              </div>
            </template>
          </SfDropdown>
        </div>
        <!-- 收尾文案覆盖共用组件的辅助色 -->
        <ResumeClosing
          class="shrink-0 border-t border-sf-b px-1 pt-1.5 text-center text-[11px] leading-4 text-sf-text!"
        />
      </aside>
      <!-- 边缘把手：固定在抽屉右缘，随滑块一起平移；收起后正好停在屏幕左缘，展开时充当收起按钮，不占布局宽度 -->
      <SfTooltip
        :content="collapsed ? $t('expandModuleTree') : $t('collapseModuleTree')"
        placement="right"
        class="absolute top-1/2 left-full z-50 -translate-y-1/2"
      >
        <button
          type="button"
          class="flex h-12 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-r-2xl border border-l-0 border-sf-b bg-sf-primary text-sf-text-2 transition-all duration-300 hover:text-sf-theme"
          :class="collapsed || floating ? 'opacity-100' : 'pointer-events-none opacity-0'"
          :aria-hidden="!(collapsed || floating)"
          :aria-label="collapsed ? $t('expandModuleTree') : $t('collapseModuleTree')"
          tabindex="-1"
          @click="collapsed = !collapsed"
        >
          <SfIcon :icon="collapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'" size="4" />
        </button>
      </SfTooltip>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 抽屉容器：移动端与桌面端固定同一宽度，宽度全部由变量统一管理 */
.module-tree-root {
  --module-tree-width: 248px; /* 模块树固定宽度，容纳卡片式图标与两行文案 */

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

/* 模块树为卡片式模块行，拖拽把手固定在行首 */
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

/* 跟手拖拽的克隆体：圆角与模块卡片一致 */
.module-sidebar-drag-fallback {
  transform: scale(1.03);
  border-radius: 16px;
  opacity: 1 !important;
  box-shadow: 0 14px 30px rgba(17, 24, 39, 0.18);
}
</style>
