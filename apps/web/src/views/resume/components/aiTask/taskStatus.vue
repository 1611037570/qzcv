<script setup lang="ts">
defineProps<{
  title: string; // 当前执行阶段的真实提示。
  description?: string; // 本流程的执行范围或结果说明。
}>();
</script>

<template>
  <!-- 生成与优化共用执行状态样式，动作由各流程通过插槽提供。 -->
  <section class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-3 text-center" aria-live="polite" aria-busy="true">
    <SfIcon icon="eos-icons:loading" size="9" class="text-sf-theme" />
    <h2 class="text-lg font-semibold text-sf-text">{{ title }}</h2>
    <p v-if="description" class="text-xs leading-6 text-sf-text-2">{{ description }}</p>
    <slot />
  </section>
</template>
