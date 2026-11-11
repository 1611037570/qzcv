<script setup lang="ts">
import type { AiChatSummary } from "@/stores/modules/resume/resumeCatalog";

defineProps<{
  chats: AiChatSummary[]; // 当前简历的对话摘要，沿用已有排序。
  activeChatId: string; // 当前打开的会话编号。
  disabled?: boolean; // 生成期间禁止切换与新建。
}>();

const emit = defineEmits<{
  select: [id: string];
  create: [];
  close: [];
}>();

function formatTime(time: number) {
  // 时间作为次级信息展示，去掉秒数以减少列表噪声。
  return new Date(time).toLocaleString("zh-CN", {
    year: "numeric", // 保留年份，便于识别较早的会话。
    month: "2-digit", // 使用两位月份。
    day: "2-digit", // 使用两位日期。
    hour: "2-digit", // 展示更新时间的小时。
    minute: "2-digit", // 展示更新时间的分钟。
    hour12: false, // 使用二十四小时制。
  });
}
</script>

<template>
  <aside class="flex h-full min-h-0 w-full flex-col bg-sf-primary">
    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-sf-b p-3">
      <div class="flex min-w-0 items-center gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sf-bg-2 text-sf-text-2">
          <SfIcon icon="ph:chats-teardrop-duotone" size="5" />
        </span>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold text-sf-text">对话记录</h2>
          <p class="text-xs leading-6 text-sf-text-3">共 {{ chats.length }} 个话题</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <SfButton type="bg" :disabled="disabled" class="h-9 gap-3" @click="emit('create')">
          <SfIcon icon="ph:plus-bold" size="4" />
          新建话题
        </SfButton>
        <SfTooltip content="返回对话">
          <button
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-sf-text-2 transition hover:bg-sf-bg-2 hover:text-sf-text"
            type="button"
            aria-label="返回对话"
            @click="emit('close')"
          >
            <SfIcon icon="mingcute:close-line" size="4" />
          </button>
        </SfTooltip>
      </div>
    </div>

    <!-- 滚动组件自带横向间距，列表只补充纵向间距。 -->
    <SfScrollbar v-if="chats.length" class="min-h-0 flex-1">
      <div class="flex flex-col gap-3 py-3">
        <button
          v-for="chat in chats"
          :key="chat.id"
          class="group flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed"
          :class="chat.id === activeChatId ? 'border-sf-theme bg-sf-theme-3' : 'border-transparent hover:border-sf-b hover:bg-sf-bg-2'"
          type="button"
          :aria-current="chat.id === activeChatId ? 'true' : undefined"
          :disabled="disabled"
          @click="emit('select', chat.id)"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            :class="chat.id === activeChatId ? 'bg-sf-theme text-sf-theme-text' : 'bg-sf-bg-2 text-sf-text-2 group-hover:bg-sf-bg'"
          >
            <SfIcon :icon="chat.mode === 'chat' ? 'ph:chats-teardrop-duotone' : 'ph:magic-wand-duotone'" size="5" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium leading-6" :class="chat.id === activeChatId ? 'text-sf-theme' : 'text-sf-text'">
              {{ chat.title }}
            </p>
            <div class="flex flex-wrap items-center gap-x-3 text-xs leading-6 text-sf-text-3">
              <span class="font-medium text-sf-text-2">{{ chat.mode === 'chat' ? '聊天' : '智能体' }}</span>
              <span aria-hidden="true">·</span>
              <time :datetime="new Date(chat.updateTime).toISOString()">{{ formatTime(chat.updateTime) }}</time>
            </div>
          </div>
          <SfIcon v-if="chat.id === activeChatId" icon="ph:check-circle-fill" size="5" class="shrink-0 text-sf-theme" />
        </button>
      </div>
    </SfScrollbar>
    <div v-else class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-3 text-center">
      <span class="flex h-12 w-12 items-center justify-center rounded-3xl bg-sf-bg-2 text-sf-text-3">
        <SfIcon icon="ph:chats-teardrop-duotone" size="6" />
      </span>
      <p class="text-sm font-medium text-sf-text">还没有对话记录</p>
      <p class="text-xs text-sf-text-3">新建话题，开始讨论你的简历</p>
    </div>
  </aside>
</template>
