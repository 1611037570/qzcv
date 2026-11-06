<script setup>
defineOptions({ name: "SfLogo" });
defineProps({
  size: {
    type: [String, Number],
    default: "7.5",
  },
  name: {
    type: String,
    default: "resume", // 默认使用简历品牌图标。
  },
});
// 品牌图标仅保留简历业务。
const map = {
  resume: defineAsyncComponent(() => import("./modules/resume.vue")), // 简历品牌图标组件。
};
</script>

<template>
  <Component :is="map[name]" :size="size" />
</template>

<style lang="scss" scoped></style>
