<template>
  <!-- 配色与网格保持原样，组件只负责便签墙呈现。 -->
  <div
    ref="container"
    class="relative min-h-0 w-full flex-1 overflow-hidden bg-sf-bg font-sans text-sf-text"
    style="
      background-image:
        linear-gradient(0deg, color-mix(in oklab, var(--sf-border) 40%, transparent) 1px, transparent 0),
        linear-gradient(90deg, color-mix(in oklab, var(--sf-border) 40%, transparent) 1px, transparent 0);
      background-size: 100px 100px;
    "
  >
    <NoteCard
      v-for="card in cards"
      :key="card.id"
      v-model:topId="topId"
      :item="card"
      :card-style="getStyle(card)"
      @pause="setPaused(card.id, $event)"
      @resize="(cardWidth, cardHeight) => setCardSize(card.id, cardWidth, cardHeight)"
    />
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import NoteCard from "./noteCard.vue";
import { useNoteWall } from "../composables/useNoteWall";
import type { NoteWallApi } from "../types";

const emit = defineEmits<{
  // 初始化或手动刷新是否仍在进行
  refreshing: [value: boolean];
}>();
const { container, cards, topId, isRefreshing, refresh, setPaused, setCardSize, getStyle } = useNoteWall();
// 页面只接收按钮状态与刷新入口，不接触墙内布局和轮换细节。
watch(isRefreshing, (value) => emit("refreshing", value), { immediate: true });
defineExpose<NoteWallApi>({
  refresh, // 供本页面按钮触发整墙刷新
});
</script>
