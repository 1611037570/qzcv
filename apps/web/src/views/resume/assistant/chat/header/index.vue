<script setup>
import MessageNav from "./messageNav.vue";

const props = defineProps({
  // 当前会话类型，由会话宿主统一判断。
  mode: {
    type: String,
    required: true,
  },
  // 首条消息发送后只展示模式，不再提供切换。
  modeLocked: {
    type: Boolean,
    default: true,
  },
  messages: {
    type: Array,
    default: () => [],
  },
  isGenerating: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(["select", "openChatList", "newChat", "selectMode"]);

// 模式选择复用统一 Tab，首条消息后的锁定规则由会话宿主维护。
const modeTabs = [
  {
    name: "Agent", // 智能体标签名称。
    value: "agent", // 智能体会话类型。
  },
  {
    name: "Chat", // 只读聊天标签名称。
    value: "chat", // 只读聊天会话类型。
  },
];

function createNewChat() {
  if (props.isGenerating) return;
  emit("newChat");
}
</script>

<template>
  <div class="px-3">
    <div class="flex w-full items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <!-- 创建前选择模式，已开始的会话只展示固定标识。 -->
        <SfTab
          v-if="!props.modeLocked"
          :list="modeTabs"
          :model-value="props.mode"
          :disabled="props.isGenerating"
          class="h-9 w-48! text-sm"
          aria-label="新会话模式"
          @update:model-value="emit('selectMode', $event)"
        />
        <span v-else class="flex h-9 items-center rounded-full bg-sf-bg-2 px-3 text-sm font-medium text-sf-text-2">
          {{ props.mode === 'chat' ? 'Chat' : 'Agent' }}
        </span>
        <MessageNav
          v-if="props.messages.length"
          :messages="props.messages"
          @select="emit('select', $event)"
        />
      </div>
      <div class="flex items-center gap-1">
        <SfTooltip content="对话记录">
          <SfIcon
            @click="emit('openChatList')"
            icon="ph:chats-teardrop-duotone"
            size="5"
            boxSize="7"
            class="cursor-pointer rounded-full text-sf-text-2 hover:bg-sf-bg-2 hover:text-sf-text"
          />
        </SfTooltip>
        <SfTooltip content="新建话题" v-if="props.modeLocked">
          <SfIcon
            @click="createNewChat"
            icon="ph:plus-bold"
            size="5"
            boxSize="7"
            class="rounded-full text-sf-text-2 hover:bg-sf-theme-2 hover:text-sf-theme-text"
            :class="{ 'cursor-not-allowed opacity-50': props.isGenerating }"
          />
        </SfTooltip>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
