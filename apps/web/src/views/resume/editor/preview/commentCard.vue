<script setup>
import { computed } from "vue";
import { useResumeStore } from "@/stores";
import { useSystemStore } from "@/stores/modules/system";
import { $t } from "@/locales";

defineProps({
  entry: { type: Object, required: true }, // 统一批注入口返回的展示记录。
  active: { type: Boolean, default: false }, // 当前是否选中该批注。
});
const emit = defineEmits(["locate", "remove"]);
const store = useResumeStore();
const systemStore = useSystemStore();
// 触屏与窄屏统一使用正常字号和触摸区域，不随纸张缩放。
const isTouchLayout = computed(() => systemStore.isMobile || !systemStore.canHover);
</script>

<template>
  <!-- 两端共用字段读写，移动端只放大触摸区域，不改变批注结构。 -->
  <article class="rounded-xl border bg-sf-primary p-3" :class="active ? 'border-sf-theme' : 'border-sf-b'">
    <button type="button" class="mb-3 line-clamp-2 cursor-pointer text-left text-sf-theme" :class="isTouchLayout ? 'min-h-12 text-base' : 'text-sm'" @click="emit('locate')">{{ entry.title }}</button>
    <SfInput
      :model-value="entry.comment.content"
      @update:model-value="store.updateComment(entry, { content: $event /* 用户编辑的批注正文。 */ })"
      type="textarea"
      :autosize="{ minRows: isTouchLayout ? 3 : 2 }"
      :input-style="isTouchLayout ? { fontSize: '16px' /* 避免移动浏览器聚焦时自动放大。 */ } : undefined"
      :aria-label="$t('resumeCommentsContent')"
      :placeholder="$t('resumeCommentsPlaceholder')"
    />
    <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sf-text-2" :class="isTouchLayout ? 'text-base' : 'text-sm'">
      <button type="button" class="cursor-pointer hover:text-sf-theme" :class="{ 'min-h-12': isTouchLayout }" @click="store.updateComment(entry, { resolved: !entry.comment.resolved /* 切换解决状态。 */ })">{{ $t(entry.comment.resolved ? "resumeCommentsReopen" : "resumeCommentsResolve") }}</button>
      <span v-if="entry.comment.resolved">{{ $t("resumeCommentsResolved") }}</span>
      <button type="button" class="cursor-pointer hover:text-sf-error" :class="{ 'min-h-12': isTouchLayout }" @click="emit('remove')">{{ $t("delete") }}</button>
    </div>
  </article>
</template>
