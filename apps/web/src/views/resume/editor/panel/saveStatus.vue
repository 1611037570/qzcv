<script setup>
// 简历落库状态展示：迁自顶部标题旁，与本地备份并排放在编辑栏头左侧
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useResumeStore } from "@/stores";
import { $t } from "@/locales";

const resumeStore = useResumeStore();
const { currentItem, saveStates } = storeToRefs(resumeStore);

// 只展示当前简历的真实落库状态，未产生写入时视为已保存。
const saveStatus = computed(() => {
  const id = currentItem.value?.id;
  if (!id) return "";
  return saveStates.value[id]?.status ?? "saved";
});
const saveStatusText = computed(() => {
  if (saveStatus.value === "error") return $t("resumeSaveFailed");
  if (saveStatus.value === "pending" || saveStatus.value === "saving") {
    return $t("resumeSaving");
  }
  return $t("resumeSaved");
});
const saveStatusClass = computed(() => {
  if (saveStatus.value === "error") return "text-sf-error";
  if (saveStatus.value === "pending" || saveStatus.value === "saving") {
    return "animate-pulse text-sf-text-3";
  }
  return "text-sf-success";
});
</script>

<template>
  <span
    v-if="saveStatus"
    class="shrink-0 px-1 text-xs transition-colors"
    :class="saveStatusClass"
  >
    {{ saveStatusText }}
  </span>
</template>

<style scoped></style>
