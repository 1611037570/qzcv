<script setup>
import MessageNav from "./messageNav.vue";
import { $t } from "@/locales";
import { computed } from "vue";

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
const modeTabs = computed(() => [
  {
    name: $t("aiChat_modeAgent"), // 智能体标签名称。
    value: "agent", // 智能体会话类型。
  },
  {
    name: $t("aiChat_modeChat"), // 只读聊天标签名称。
    value: "chat", // 只读聊天会话类型。
  },
]);

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
          :aria-label="$t('aiChat_newChatMode')"
          @update:model-value="emit('selectMode', $event)"
        />
        <!-- 锁定后只做轻量标识：小号胶囊避免占用过多头部空间 -->
        <span
          v-else
          class="flex h-6 items-center rounded-full bg-sf-bg-2 px-2 text-xs font-medium text-sf-text-2"
        >
          {{ props.mode === 'chat' ? $t('aiChat_modeChat') : $t('aiChat_modeAgent') }}
        </span>
        <MessageNav
          v-if="props.messages.length"
          :messages="props.messages"
          @select="emit('select', $event)"
        />
      </div>
      <div class="flex items-center gap-1">
        <SfTooltip :content="$t('aiChat_chatHistory')">
          <SfIcon
            @click="emit('openChatList')"
            icon="ph:chats-teardrop-duotone"
            size="5"
            boxSize="7"
            class="cursor-pointer rounded-full text-sf-text-2 hover:bg-sf-bg-2 hover:text-sf-text"
          />
        </SfTooltip>
        <SfTooltip :content="$t('aiChat_newTopic')" v-if="props.modeLocked">
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
