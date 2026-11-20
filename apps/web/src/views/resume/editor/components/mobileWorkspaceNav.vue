<script setup>
const props = defineProps({
  activePanel: {
    type: String,
    default: "preview",
  },
});
const emit = defineEmits(["select"]);
const panelOptions = [
  { value: "edit", label: "edit", icon: "lucide:file-text" },
  {
    value: "preview", // 预览面板标识。
    label: "resumePanelPreview", // 底部按钮使用简短的预览文案。
    icon: "lucide:eye", // 预览按钮图标。
  },
];
</script>

<template>
  <!-- :style="{ marginBottom: 'max(0.75rem,env(safe-area-inset-bottom))' }" -->
  <!-- 分割线与底栏背景放在同一元素：与顶部横滑条同模式；z-50 保证高于面板动画层与右侧工具栏收起态 -->
  <nav class="relative z-50 w-full shrink-0">
    <div
      class="flex w-full items-center justify-center gap-1 border-t border-sf-bg-3 bg-sf-primary p-1"
      :aria-label="$t('resumePreview')"
    >
      <!-- 底栏铺满宽度，按钮等分空间并保留圆角与选中样式。 -->
      <button
        v-for="option in panelOptions"
        :key="option.value"
        type="button"
        class="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl px-2 text-xs transition-colors"
        :class="
          props.activePanel === option.value ? 'bg-sf-theme text-sf-theme-text' : 'text-sf-text-2'
        "
        :aria-pressed="props.activePanel === option.value"
        @click="emit('select', option.value)"
      >
        <SfIcon :icon="option.icon" size="4" />
        <span>{{ $t(option.label) }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped></style>
