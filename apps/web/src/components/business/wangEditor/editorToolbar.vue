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
  <div ref="toolbarRef" class="min-w-0 flex-1">
    <Toolbar :editor="editor" :default-config="config" :mode="mode" />
    <Teleport v-for="item in targets" :key="item.key" :to="item.button">
      <SfIcon :icon="item.icon" size="4" class="sf-wang-toolbar-icon" />
    </Teleport>
  </div>
</template>
