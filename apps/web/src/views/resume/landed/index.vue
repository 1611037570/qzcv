<template>
  <section class="flex h-full min-h-0 w-full flex-col bg-sf-bg">
    <!-- 标题栏独立保留间距，便签墙铺满其余区域。 -->
    <header class="flex items-center justify-between gap-3 bg-transparent p-3">
      <h1 class="text-lg font-semibold text-sf-text">{{ $t("resumeNavLanded") }}</h1>
      <SfButton :disabled="isRefreshing" @click="refreshWall">
        {{ isRefreshing ? "更新中..." : "重新获取" }}
      </SfButton>
    </header>
    <NoteWall ref="noteWall" @refreshing="isRefreshing = $event" />
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import NoteWall from "./components/noteWall.vue";
import type { NoteWallApi } from "./types";

const noteWall = ref<NoteWallApi | null>(null); // 当前页面专属便签墙组件
const isRefreshing = ref(false); // 便签墙反馈的刷新状态
// 页面只负责触发组件公开的刷新操作。
const refreshWall = () => noteWall.value?.refresh();
</script>
