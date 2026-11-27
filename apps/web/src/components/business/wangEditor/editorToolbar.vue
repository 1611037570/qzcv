<script setup>
import { onMounted, ref, shallowRef } from "vue";
import { useMutationObserver } from "@vueuse/core";
import { Toolbar } from "./editorLoader";

defineProps({
  editor: { type: Object, required: true }, // 工具栏操作的编辑器实例。
  config: { type: Object, required: true }, // 当前编辑视图的工具栏配置。
  mode: { type: String, required: true }, // 编辑器工具栏模式。
});

// 保留编辑器菜单的行为，只为现有按钮提供统一的项目图标。
const icons = {
  clearStyle: "lucide:eraser", // 清除选中文字的格式。
  bold: "lucide:bold", // 加粗文字。
  italic: "lucide:italic", // 设置斜体。
  underline: "lucide:underline", // 设置下划线。
  color: "lucide:baseline", // 设置文字颜色。
  bgColor: "lucide:paint-bucket", // 设置文字背景颜色。
  bulletedList: "lucide:list", // 创建无序列表。
  numberedList: "lucide:list-ordered", // 创建有序列表。
  insertLink: "lucide:link", // 插入链接。
  undo: "lucide:undo-2", // 撤销操作。
  redo: "lucide:redo-2", // 重做操作。
  expandEditor: "lucide:maximize", // 展开编辑器。
};
const toolbarRef = ref();
const targets = shallowRef([]);

// 触屏点按工具栏会让正文失焦，wangEditor 随即清空选区，菜单命令只能落到待输入标记上；
// 因此触屏下阻止默认焦点切换，再手动补发一次点击，让命令作用于正文选区。
let touchButton = null; // 手指按下时命中的工具栏按钮
let touchStartX = 0; // 按下位置横坐标，用于区分点按与滑动
let touchStartY = 0; // 按下位置纵坐标，用于区分点按与滑动
// 仅触屏设备需要绕过失焦问题，桌面端保持原生点击行为。
const isTouchDevice = () => window.matchMedia("(hover: none)").matches;

const handleToolbarTouchStart = (event) => {
  if (!isTouchDevice()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button[data-menu-key]");
  if (!(button instanceof HTMLElement)) return;
  const touch = event.touches[0];
  touchButton = button;
  touchStartX = touch?.clientX ?? 0;
  touchStartY = touch?.clientY ?? 0;
  // 阻止默认行为，避免按钮抢走正文焦点导致选区被清空。
  event.preventDefault();
};

const handleToolbarTouchEnd = (event) => {
  const button = touchButton;
  touchButton = null;
  if (!button) return;
  const touch = event.changedTouches[0];
  const moved =
    touch &&
    (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10);
  // 手指有明显位移视为滑动，不触发按钮。
  if (moved) return;
  button.click();
};

// 触摸被系统取消时清空待触发按钮。
const handleToolbarTouchCancel = () => {
  touchButton = null;
};

// 等待异步工具栏创建，并在菜单节点重建时重新绑定图标。
const syncIcons = () => {
  const buttons = [...(toolbarRef.value?.querySelectorAll("button[data-menu-key]") || [])];
  const next = buttons.flatMap((button) => {
    const key = button.getAttribute("data-menu-key");
    if (!icons[key]) return [];
    button.classList.add("sf-wang-icon-ready");
    return [{ button, icon: icons[key], key }];
  });
  if (next.length === targets.value.length && next.every((item, index) => item.button === targets.value[index].button)) return;
  targets.value = next;
};
useMutationObserver(toolbarRef, syncIcons, { childList: true, subtree: true });
onMounted(syncIcons);
</script>

<template>
  <div
    ref="toolbarRef"
    class="min-w-0 flex-1"
    @touchstart="handleToolbarTouchStart"
    @touchend="handleToolbarTouchEnd"
    @touchcancel="handleToolbarTouchCancel"
  >
    <Toolbar :editor="editor" :default-config="config" :mode="mode" />
    <Teleport v-for="item in targets" :key="item.key" :to="item.button">
      <SfIcon :icon="item.icon" size="4" class="sf-wang-toolbar-icon" />
    </Teleport>
  </div>
</template>
