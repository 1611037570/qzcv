<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useDebounceFn, useEventListener, useMutationObserver, useResizeObserver } from "@vueuse/core";
import { useResumeStore } from "@/stores";
import { useSystemStore } from "@/stores/modules/system";
import CommentCard from "./commentCard.vue";
import { $t } from "@/locales";

const props = defineProps({
  // 编辑预览容器，仅在此范围内定位所属模块或记录。
  root: { type: Object, default: null },
  // 未缩放的预览视口，移动端入口不受纸张缩放影响。
  viewport: { type: Object, default: null },
  // 纸张实际缩放比例，批注通过反向补偿保持屏幕尺寸。
  scale: { type: Number, default: 1 },
});
// 仅控制批注内容与连线，添加入口和数量始终保留。
const contentVisible = defineModel("visible", { type: Boolean, default: true });
const store = useResumeStore();
const systemStore = useSystemStore();
// 触屏设备同样使用未缩放弹层，避免宽视口手机和平板显示微小页边卡片。
const isMobile = computed(() => systemStore.isMobile || !systemStore.canHover);
const mobileOpened = ref(false); // 移动端按需打开的批注列表。
const mobileModuleKey = ref(""); // 移动端筛选模块，空值显示全部批注。
const pending = ref(null); // 待添加批注的模块或记录归属。
const activeId = ref(""); // 当前选中批注编号。
const expandedId = ref(""); // 全部卡片共用唯一展开编号，默认只显示摘要。
const toggleComment = (entry) => {
  expandedId.value = expandedId.value === entry.key ? "" : entry.key;
  activeId.value = entry.key;
};
const opened = ref(false); // 添加批注时显示填写弹窗。
const draft = ref(""); // 提交前的批注草稿，取消时不写入简历。
const positions = ref([]); // 卡片位置与连接线的画布坐标。
const laneHeight = ref(0); // 批注列高度，供共享滚动区域容纳全部卡片。
const sidebar = ref(null); // 纸张右侧的批注卡片列。
const moduleMarkers = ref([]); // 模块外部批注入口的画布位置。
const hoveredModule = ref(""); // 当前悬停的模块标识。
const hoveredTarget = ref(null); // 当前悬停的模块或记录，用于确定新增批注的持有者。
// 页面只消费统一批注集合，持有者结构与数据操作由 Store 和领域入口维护。
const comments = computed(() => store.currentComments);
const mobileModules = computed(() => [
  { value: "", name: $t("resumeCommentsAll") }, // 默认展示全部模块的批注。
  ...moduleMarkers.value.map((marker) => ({
  value: marker.moduleKey, // 实际预览中的模块标识。
  name: `${store.getCommentTitle({ moduleKey: marker.moduleKey /* 模块归属。 */, itemIndex: -1 /* 模块本身。 */ })} · ${moduleCommentCount(marker.moduleKey)}`, // 模块标题及其批注数量。
})),
]);
// 未选择模块时展示完整集合，仅手动选择后筛选。
const mobileComments = computed(() => mobileModuleKey.value
  ? comments.value.filter((entry) => entry.moduleKey === mobileModuleKey.value) : comments.value);
// 全部视图新增批注时沿用当前编辑模块，没有匹配项时使用首个模块。
const mobileAddModuleKey = computed(() => mobileModuleKey.value ||
  moduleMarkers.value.find((marker) => marker.moduleKey === store.editingModuleKey)?.moduleKey ||
  moduleMarkers.value[0]?.moduleKey || "");
const pendingTitle = computed(() => pending.value ? store.getCommentTitle(pending.value) : ""); // 添加弹窗使用同一表单标题来源。
let disposed = false; // 离开编辑器后禁止延迟布局任务重新执行。

// 切换简历时清除当前归属和添加状态。
watch(() => store.currentData, () => {
  pending.value = null;
  activeId.value = "";
  expandedId.value = "";
  opened.value = false;
  mobileOpened.value = false;
  mobileModuleKey.value = "";
  hoveredTarget.value = null;
}, { immediate: true });

const blocks = () => Array.from(props.root?.querySelectorAll("[data-comment-module]") ?? []);
// 定位只读取当前持有者标记，正文修改和记录排序不会改变批注归属。
const findOwnerBlock = (target) => target.itemIndex >= 0
  ? blocks().find((block) => block.dataset.commentModule === target.moduleKey &&
    Number(block.dataset.commentItem) === target.itemIndex)
  : Array.from(props.root?.querySelectorAll("[data-layout-module]") ?? [])
    .find((module) => module.dataset.layoutModule === target.moduleKey);
// 持有者和卡片换算为未缩放画布坐标，按持有者位置排布并逐张避让。
const layoutCards = async () => {
  await nextTick();
  if (disposed || !props.root) return;
  const rootRect = props.root.getBoundingClientRect();
  const scale = props.root.offsetWidth ? rootRect.width / props.root.offsetWidth : 1;
  if (!scale) return;
  // 外侧入口独占一列，卡片从其右边开始，避免数量徽标压住正文或卡片。
  const endX = sidebar.value ? (sidebar.value.getBoundingClientRect().left - rootRect.left) / scale + 36 / scale : 0;
  const seen = new Set();
  const markers = [];
  props.root.querySelectorAll("[data-layout-module]").forEach((module) => {
    const moduleKey = module.dataset.layoutModule;
    if (seen.has(moduleKey)) return;
    const page = module.closest(".resume-page-item");
    if (!page) return;
    seen.add(moduleKey);
    markers.push({
      moduleKey, // 当前入口所属的整个模块。
      left: (page.getBoundingClientRect().right - rootRect.left) / scale + 6 / scale, // 入口在纸张外保持固定屏幕间距。
      top: (module.getBoundingClientRect().top - rootRect.top) / scale, // 对齐模块起点，不插入模块标题。
    });
  });
  if (JSON.stringify(markers) !== JSON.stringify(moduleMarkers.value)) moduleMarkers.value = markers;
  // 手机使用弹层，隐藏内容时仅计算入口位置，不保留卡片高度和连线。
  if (isMobile.value || !sidebar.value || !contentVisible.value) {
    positions.value = [];
    laneHeight.value = 0;
    return;
  }
  const anchors = comments.value.map((comment) => {
    const block = findOwnerBlock(comment);
    const rect = block?.getBoundingClientRect();
    const page = block?.closest(".resume-page-item");
    return {
      id: comment.key, // 对应当前持有者的批注展示标识。
      anchorY: rect ? (rect.top - rootRect.top) / scale + 12 / scale : null, // 所属模块或记录起点的画布纵坐标。
      startX: page ? (page.getBoundingClientRect().right - rootRect.left) / scale : endX - 12, // 连接线从纸张右边缘起始。
    };
  }).sort((left, right) => (left.anchorY ?? Infinity) - (right.anchorY ?? Infinity));
  let bottom = 0;
  const next = anchors.map((anchor) => {
    const card = sidebar.value.querySelector(`[data-comment-id="${anchor.id}"]`);
    const height = card ? card.getBoundingClientRect().height / scale : 120;
    const top = Math.max(bottom, (anchor.anchorY ?? bottom) - 24 / scale, 0);
    bottom = top + height + 12 / scale;
    return {
      ...anchor, // 持有者位置与纸张边缘坐标。
      top, // 卡片在批注列中的顶部位置。
      endX, // 连接线终点横坐标。
      endY: top + 24 / scale, // 连接线接入固定屏幕尺寸的卡片标题区域。
    };
  });
  if (JSON.stringify(next) !== JSON.stringify(positions.value)) positions.value = next;
  laneHeight.value = bottom;
};
const scheduleLayout = useDebounceFn(layoutCards, 30);
useResizeObserver(() => sidebar.value ? Array.from(sidebar.value.querySelectorAll("article")) : [], scheduleLayout);
useResizeObserver(() => props.root, scheduleLayout);
// 手动缩放只改变变换样式，同步更新持有者坐标与卡片避让。
watch(() => props.scale, scheduleLayout, { flush: "post" });
const cardTop = (id) => positions.value.find((position) => position.id === id)?.top ?? 0;
// 排序、内容重排和批注变化只更新布局，不进行文字匹配或失效判定。
useMutationObserver(() => props.root, scheduleLayout, {
  childList: true, // 分页和记录移动后重新计算位置。
  characterData: true, // 正文变化只影响布局。
  subtree: true, // 观察预览中的所有模块与记录。
  attributes: true, // 记录排序后同步持有者标记。
  attributeFilter: ["data-comment-item", "data-comment-module", "data-layout-module"], // 只观察批注所属标记。
});
watch([comments, () => props.root, contentVisible], scheduleLayout, { deep: true, flush: "post", immediate: true });
// 隐藏内容时关闭查看弹层，新增弹窗仍可独立使用。
watch(contentVisible, (visible) => {
  if (!visible) mobileOpened.value = false;
});
watch(isMobile, () => {
  mobileOpened.value = false;
  scheduleLayout();
});

const close = () => {
  opened.value = false;
  mobileOpened.value = false;
  activeId.value = "";
  pending.value = null;
};
useEventListener(window, "keydown", (event) => {
  if (event.key === "Escape") close();
});
// 新增批注归悬停记录或当前编辑记录持有，模块入口不依赖正文是否为空。
const requestModuleComment = async (moduleKey) => {
  if (!moduleKey) return;
  pending.value = {
    moduleKey, // 本次新增批注所属模块。
    // 布局标题不覆盖当前编辑记录的归属，只有真实悬停记录才优先采用。
    itemIndex: hoveredTarget.value?.moduleKey === moduleKey && hoveredTarget.value.itemIndex >= 0
      ? hoveredTarget.value.itemIndex
      : store.editingModuleKey === moduleKey ? (store.editingItemIndex ?? -1) : -1, // 优先使用悬停记录，其次为当前编辑记录。
  };
  // 先填写再提交，取消添加不会产生空批注。
  draft.value = "";
  // 先关闭列表弹层，再打开新增弹层，避免两个模态框同时锁定滚动。
  if (mobileOpened.value) {
    mobileOpened.value = false;
    await nextTick();
  }
  opened.value = true;
};
const moduleCommentCount = (moduleKey) => comments.value.filter((entry) => entry.moduleKey === moduleKey).length;
const openMobileComments = (moduleKey = "") => {
  contentVisible.value = true;
  mobileModuleKey.value = mobileModules.value.some((item) => item.value === moduleKey)
    ? moduleKey : "";
  mobileOpened.value = true;
};
const viewModuleComments = async (moduleKey) => {
  if (isMobile.value) {
    openMobileComments(moduleKey);
    return;
  }
  const entry = comments.value.find((comment) => comment.moduleKey === moduleKey);
  if (!entry) return;
  // 点击数量展开内容，待卡片布局完成后定位。
  contentVisible.value = true;
  activeId.value = entry.key;
  expandedId.value = entry.key;
  await layoutCards();
  await nextTick();
  sidebar.value?.querySelector(`[data-comment-id="${entry.key}"]`)?.scrollIntoView({ block: "nearest" });
};
// 悬停按模块整体识别，外侧按钮不进入简历标题和正文的渲染结构。
useEventListener(() => props.root, "mouseover", (event) => {
  const module = event.target.closest?.("[data-layout-module]");
  if (!module) return;
  hoveredModule.value = module.dataset.layoutModule;
  const block = event.target.closest?.("[data-comment-module]");
  hoveredTarget.value = {
    moduleKey: module.dataset.layoutModule, // 当前悬停模块。
    itemIndex: block ? Number(block.dataset.commentItem) : -1, // 当前悬停记录，模块标题不绑定记录。
  };
});
useEventListener(() => props.root, "mouseleave", () => {
  hoveredModule.value = "";
  hoveredTarget.value = null;
});
const addComment = async () => {
  if (!pending.value || !draft.value.trim()) return;
  const entry = store.createComment(pending.value, draft.value);
  if (!entry) return;
  activeId.value = entry.key;
  expandedId.value = entry.key;
  opened.value = false;
  draft.value = "";
  pending.value = null;
  await nextTick();
  // 根据所属模块或记录计算新批注位置，并滚动到卡片。
  await layoutCards();
  // 隐藏时添加只更新数量，不主动展开批注内容。
  if (!contentVisible.value) return;
  if (isMobile.value) {
    openMobileComments();
    return;
  }
  sidebar.value?.querySelector(`[data-comment-id="${entry.key}"]`)?.scrollIntoView({ block: "nearest" });
};
const locate = (comment) => {
  activeId.value = comment.key;
  mobileOpened.value = false;
  findOwnerBlock(comment)?.scrollIntoView({ block: "center", behavior: "smooth" });
};
const remove = (comment) => {
  store.deleteComment(comment);
  if (activeId.value === comment.key) activeId.value = "";
  if (expandedId.value === comment.key) expandedId.value = "";
};
onBeforeUnmount(() => {
  disposed = true;
});
</script>

<template>
  <!-- 弹窗仅收集新批注，已有内容直接在页边卡片编辑。 -->
  <SfModal v-model="opened" :title="$t('resumeCommentsAdd')" :full="isMobile" :width="isMobile ? '' : '480px'">
    <div data-comment-control data-resume-editor-action class="flex h-full min-h-0 flex-col gap-3">
      <SfScrollbar class="min-h-0 flex-1" :class="isMobile ? '' : 'max-h-[60vh]'" flush>
        <p class="line-clamp-3 text-sm text-sf-text-2">{{ pendingTitle }}</p>
        <SfInput v-model="draft" type="textarea" :autosize="{ minRows: isMobile ? 6 : 3 }" :input-style="isMobile ? { fontSize: '16px' /* 避免聚焦时自动放大。 */ } : undefined" :aria-label="$t('resumeCommentsContent')" :placeholder="$t('resumeCommentsPlaceholder')" />
      </SfScrollbar>
      <div class="flex shrink-0 justify-end gap-3">
        <button type="button" class="cursor-pointer px-3 text-sm text-sf-text-2" :class="{ 'min-h-12': isMobile }" @click="close">{{ $t("cancel") }}</button>
        <button type="button" class="rounded-xl border border-sf-b px-3 py-3 text-sm text-sf-theme enabled:cursor-pointer enabled:hover:border-sf-theme disabled:opacity-50" :class="{ 'min-h-12': isMobile }" :disabled="!draft.trim()" @click="addComment">{{ $t("resumeCommentsAdd") }}</button>
      </div>
    </div>
  </SfModal>
  <!-- 移动入口在未缩放的视口显示，不挤占纸张宽度，也不依赖悬停。 -->
  <Teleport v-if="isMobile && viewport" :to="viewport">
    <button type="button" data-resume-editor-action data-comment-control class="absolute right-3 bottom-3 z-30 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-sf-b bg-sf-primary px-3 text-sm text-sf-theme shadow" @click="openMobileComments()">
      <SfIcon icon="mdi:notebook-outline" size="5" />
      {{ $t("resumeCommentsTitle") }} · {{ comments.length }}
    </button>
  </Teleport>
  <SfModal v-model="mobileOpened" :title="$t('resumeCommentsTitle')" full>
    <div data-comment-control data-resume-editor-action class="flex h-full min-h-0 flex-col gap-3">
      <div class="flex shrink-0 items-center gap-3">
        <SfSelect v-model="mobileModuleKey" :list="mobileModules" :aria-label="$t('resumeCommentsModule')" class="min-w-0" size="large" />
        <button type="button" class="min-h-12 shrink-0 cursor-pointer rounded-xl border border-sf-b px-3 text-sm text-sf-theme" :disabled="!mobileAddModuleKey" @click="requestModuleComment(mobileAddModuleKey)">{{ $t("resumeCommentsAdd") }}</button>
      </div>
      <SfScrollbar class="min-h-0 flex-1" flush>
        <div class="flex flex-col gap-3">
          <p v-if="!mobileComments.length" class="text-sm text-sf-text-2">{{ $t("resumeCommentsEmpty") }}</p>
          <CommentCard v-for="entry in mobileComments" :key="entry.key" :entry="entry" :active="activeId === entry.key" :expanded="expandedId === entry.key" @toggle="toggleComment(entry)" @focusin="activeId = entry.key" @locate="locate(entry)" @remove="remove(entry)" />
        </div>
      </SfScrollbar>
    </div>
  </SfModal>
  <!-- 仅桌面页边内容进入缩放画布，触屏入口与弹层保留屏幕原始尺寸。 -->
  <Teleport v-if="!isMobile && root" :to="root">
  <!-- 连线只绘制在纸张与批注之间，不覆盖正文，也不拦截鼠标操作。 -->
  <svg v-if="!isMobile && contentVisible && comments.length" data-resume-editor-action aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full">
    <template v-for="position in positions" :key="position.id">
      <path
        v-if="position.anchorY != null"
        :d="`M ${position.startX} ${position.anchorY} C ${position.startX + 6} ${position.anchorY}, ${position.endX - 6} ${position.endY}, ${position.endX} ${position.endY}`"
        fill="none"
        stroke="currentColor"
        :stroke-width="(activeId === position.id ? 2 : 1) / scale"
        :class="activeId === position.id ? 'text-sf-theme' : 'text-sf-text-3'"
      />
    </template>
  </svg>
  <!-- 模块数量与添加入口位于纸张外部，不改变标题文字或标题样式。 -->
  <template v-for="marker in isMobile ? [] : moduleMarkers" :key="marker.moduleKey">
    <div
      v-if="hoveredModule === marker.moduleKey || moduleCommentCount(marker.moduleKey)"
      data-resume-editor-action
      data-comment-control
      class="absolute z-10 flex w-6 flex-col items-center rounded border border-sf-b bg-sf-primary text-sf-theme"
      :style="{ left: `${marker.left}px`, top: `${marker.top}px`, transform: `scale(${1 / scale})`, transformOrigin: 'top left' }"
    >
      <SfTooltip :content="$t('resumeCommentsAdd')">
        <button type="button" class="flex h-6 w-6 cursor-pointer items-center justify-center hover:bg-sf-bg" :aria-label="$t('resumeCommentsAdd')" @mousedown.prevent @click="requestModuleComment(marker.moduleKey)">
          <SfIcon icon="mdi:notebook-outline" size="4" />
        </button>
      </SfTooltip>
      <button
        v-if="moduleCommentCount(marker.moduleKey)"
        type="button"
        class="w-6 cursor-pointer border-t border-sf-b text-xs leading-6 hover:bg-sf-bg"
        :aria-label="$t('resumeCommentsModuleCount', { count: moduleCommentCount(marker.moduleKey) })"
        @click="viewModuleComments(marker.moduleKey)"
      >{{ moduleCommentCount(marker.moduleKey) }}</button>
    </div>
  </template>
  <aside
    v-if="!isMobile"
    ref="sidebar"
    data-resume-editor-action
    data-comment-control
    class="relative shrink-0"
    :style="{ width: `${(contentVisible && comments.length ? 324 : 36) / scale}px`, height: `${laneHeight}px` }"
    :aria-label="$t('resumeCommentsTitle')"
  >
      <template v-if="contentVisible">
        <CommentCard
          v-for="comment in comments"
          :key="comment.key"
          :data-comment-id="comment.key"
          class="absolute w-72"
          :style="{ left: `${36 / scale}px`, top: `${cardTop(comment.key)}px`, transform: `scale(${1 / scale})`, transformOrigin: 'top left' }"
          :entry="comment"
          :active="activeId === comment.key"
          :expanded="expandedId === comment.key"
          @toggle="toggleComment(comment)"
          @focusin="activeId = comment.key"
          @locate="locate(comment)"
          @remove="remove(comment)"
        />
      </template>
  </aside>
  </Teleport>
</template>

