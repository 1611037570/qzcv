<template>
  <div
    ref="cardElement"
    class="absolute transform-gpu cursor-pointer overflow-hidden rounded-xl border shadow-md will-change-transform select-none hover:shadow-lg"
    :style="[cardStyle, themeStyle]"
    @click="copyContent"
    @mouseenter="emit('pause', true)"
    @mouseleave="emit('pause', false)"
  >
    <div class="flex h-full w-full flex-1 items-center justify-center p-4 text-center text-base font-semibold break-words whitespace-normal text-black/72">
      {{ item.content }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { CSSProperties } from "vue";
import { useClipboard, useResizeObserver } from "@vueuse/core";
import { ElMessage } from "element-plus";
import { $t } from "@/locales";
import { lightThemeColors, darkThemeColors } from "@/configs";
import { useThemeStore } from "@/stores/modules/theme";
import type { NoteItem } from "../types";

const props = defineProps<{
  // 当前便签的纯文案与显示状态
  item: NoteItem;
  // 墙内位置与进出场动效样式
  cardStyle: CSSProperties;
}>();
const emit = defineEmits<{
  // 当前便签的悬停阅读状态
  pause: [paused: boolean];
  // 当前便签未旋转缩放的实际尺寸
  resize: [width: number, height: number];
}>();
const topId = defineModel<string>("topId", { required: true });
const cardElement = ref<HTMLDivElement | null>(null); // 用于测量便签的自然尺寸
const themeStore = useThemeStore();
const colorIndex = Math.floor(Math.random() * lightThemeColors.length); // 明暗主题共用色系
const zIndex = Math.floor(Math.random() * 10); // 保留原便签随机层叠效果

// 配色与点击置顶由当前便签负责，不携带页面级轮换计时器。
const themeStyle = computed<CSSProperties>(() => {
  const palette = themeStore.isDark ? darkThemeColors : lightThemeColors;
  return {
    background: props.item.type === "fixed" ? "red" : palette[colorIndex]!.value, // 首推与普通便签背景
    borderColor: "color-mix(in oklab, var(--sf-border) 40%, transparent)", // 保留低对比度描边
    zIndex: topId.value === props.item.id ? 9999999 : props.item.type === "fixed" ? 50 : zIndex, // 当前便签层级
  };
});
// 使用未旋转缩放的布局尺寸，避免动画影响边界测量。
useResizeObserver(cardElement, () => {
  const element = cardElement.value;
  if (element) emit("resize", element.offsetWidth, element.offsetHeight);
});
onBeforeUnmount(() => emit("pause", false));

const { copy, isSupported } = useClipboard({ legacy: true });
// 展示与复制使用同一纯文案，并保留原来的点击置顶行为。
const copyContent = async () => {
  topId.value = props.item.id;
  if (!isSupported.value) {
    ElMessage.error($t("resume_note_copy_unsupported"));
    return;
  }
  try {
    await copy(props.item.content);
    ElMessage.success($t("resume_note_copy_success"));
  } catch {
    ElMessage.error($t("resume_note_copy_failed"));
  }
};
</script>
