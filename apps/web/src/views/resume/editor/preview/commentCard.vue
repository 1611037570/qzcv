<script setup>
import { computed } from "vue";
import { useResumeStore } from "@/stores";
import { useSystemStore } from "@/stores/modules/system";
import { $t } from "@/locales";

defineProps({
  entry: { type: Object, required: true }, // 统一批注入口返回的展示记录。
  active: { type: Boolean, default: false }, // 当前是否选中该批注。
  expanded: { type: Boolean, default: false }, // 是否展开完整正文编辑区。
});
const emit = defineEmits(["locate", "remove", "toggle"]);
const store = useResumeStore();
const systemStore = useSystemStore();
// 触屏与窄屏统一使用正常字号和触摸区域，不随纸张缩放。
const isTouchLayout = computed(() => systemStore.isMobile || !systemStore.canHover);
</script>

<template>
  <!-- 两端共用字段读写，移动端只放大触摸区域，不改变批注结构。 -->
  <article class="rounded-xl border bg-sf-primary p-3" :class="active ? 'border-sf-theme' : 'border-sf-b'">
    <!-- 标题负责展开正文，操作按钮始终位于外部标题栏，不随正文收起。 -->
    <div class="flex items-center justify-between gap-3">
      <button type="button" class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left text-sf-theme" :class="isTouchLayout ? 'min-h-12 text-base' : 'text-sm'" :aria-expanded="expanded" @click="emit('toggle')">
        <span aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span>
        <span class="line-clamp-1">{{ entry.title }}</span>
      </button>
      <div class="flex shrink-0 items-center gap-3">
        <SfTooltip :content="$t('resumeCommentsLocate')">
          <button type="button" class="flex cursor-pointer items-center justify-center text-sf-text-2 hover:text-sf-theme" :class="isTouchLayout ? 'h-12 w-12' : 'h-6 w-6'" :aria-label="$t('resumeCommentsLocate')" @click="emit('locate')">
            <SfIcon icon="ph:crosshair-duotone" size="4" />
          </button>
        </SfTooltip>
        <SfTooltip :content="$t(entry.comment.resolved ? 'resumeCommentsReopen' : 'resumeCommentsResolve')">
          <button type="button" class="flex cursor-pointer items-center justify-center hover:text-sf-theme" :class="[isTouchLayout ? 'h-12 w-12' : 'h-6 w-6', entry.comment.resolved ? 'text-sf-theme' : 'text-sf-text-2']" :aria-label="$t(entry.comment.resolved ? 'resumeCommentsReopen' : 'resumeCommentsResolve')" :aria-pressed="entry.comment.resolved" @click="store.updateComment(entry, { resolved: !entry.comment.resolved /* 切换解决状态。 */ })">
            <SfIcon :icon="entry.comment.resolved ? 'lucide:undo-2' : 'lucide:check'" size="4" />
          </button>
        </SfTooltip>
        <SfTooltip :content="$t('delete')">
          <button type="button" class="flex cursor-pointer items-center justify-center text-sf-text-2 hover:text-sf-error" :class="isTouchLayout ? 'h-12 w-12' : 'h-6 w-6'" :aria-label="$t('delete')" @click="emit('remove')">
            <SfIcon icon="lucide:trash-2" size="4" />
          </button>
        </SfTooltip>
      </div>
    </div>
    <p v-if="!expanded" class="mt-3 line-clamp-2 whitespace-pre-line text-sm text-sf-text-2">{{ entry.comment.content || $t('resumeCommentsPlaceholder') }}</p>
    <template v-else>
    <SfInput
      class="mt-3"
      :model-value="entry.comment.content"
      @update:model-value="store.updateComment(entry, { content: $event /* 用户编辑的批注正文。 */ })"
      type="textarea"
      :autosize="{ minRows: isTouchLayout ? 3 : 2 }"
      :input-style="isTouchLayout ? { fontSize: '16px' /* 避免移动浏览器聚焦时自动放大。 */ } : undefined"
      :aria-label="$t('resumeCommentsContent')"
      :placeholder="$t('resumeCommentsPlaceholder')"
    />
    </template>
  </article>
</template>
