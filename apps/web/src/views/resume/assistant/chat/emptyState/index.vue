<script setup lang="ts">
import { ALL_MODULE_KEY } from "@/stores/modules/resume/config/defaultConfig";
import { computed } from "vue";
import type { SuggestCard } from "../../types";
import OneKeyIntro from "../../../editor/components/oneKeyIntro.vue";
import { useOneKeyActions, type OneKeyFlow } from "../../../editor/hooks/useOneKeyActions";
import type { ResumeAssistantMode } from "@snowflake/resume-agent";

// 当前操作模块列表：选中哪些模块就遍历展示哪些模块
const props = defineProps<{
  mode?: ResumeAssistantMode; // 当前空白会话模式，聊天只展示建议能力。
  suggestions: SuggestCard[];
  selectedModules?: any[];
  removeModule?: (key: string) => void;
}>();
const emit = defineEmits(["switch-mode", "suggest"]);

// 编辑器只展示简历能力，面试训练由工作区独立栏目承接。
const visibleSuggestions = computed(() =>
  props.suggestions.filter((card) => card.category === "resume"),
);

// 一键优化与一键调整并排置顶，其余能力由用户在聊天中直接描述触发
const isOneKeyFlow = (flow: string): flow is OneKeyFlow =>
  flow === "oneKeyOptimize" || flow === "oneKeyAdjust";
const oneKeySuggestions = computed(() =>
  visibleSuggestions.value.filter((card) => isOneKeyFlow(card.flow)),
);

// 优化打开独立弹窗，调整确认说明后继续原有助手流程。
const { introVisible, openOneKeyIntro, confirmOneKeyIntro } = useOneKeyActions(
  (flow) => emit("suggest", { flow }),
);

// 点击一键卡片，先展示功能介绍，确认后启动对应流程
const handleSuggest = (card: SuggestCard) => {
  if (!isOneKeyFlow(card.flow)) return;
  openOneKeyIntro(card.flow);
};
</script>

<template>
  <div
    class="relative flex h-full w-full flex-col items-center justify-center gap-3 text-center select-none"
  >
    <div class="flex-c gap-3 text-2xl font-bold text-sf-base select-none">
      {{ $t("aiChat_greetingPrefix") }}
      <span class="text-sf-theme">{{ props.mode === 'chat' ? $t('aiChat_chatName') : $t('aiChat_agentName') }}</span>
      <SfIcon icon="lucide:sparkles" class="text-sf-theme" size="6" />
    </div>
    <div class="flex flex-wrap items-center justify-center gap-3 text-sm font-medium text-sf-base">
      <span>{{ props.mode === 'chat' ? $t('aiChat_chatIntro') : $t('aiChat_agentIntro') }}</span>
    </div>
    <div class="flex flex-wrap items-center justify-center gap-x-3 text-sm">
      {{ props.mode === 'chat' ? $t('aiChat_chatExample') : $t('aiChat_agentExample') }}
    </div>
    <p v-if="props.mode === 'chat'" class="text-sm text-sf-text-2">{{ $t("aiChat_chatNote") }}</p>
    <!-- 模块说明弱化为辅助信息，与主提示区分层次 -->
    <div class="flex flex-wrap items-center justify-center gap-x-3 text-xs text-sf-text-2">
      {{ $t("aiChat_iWillFollow") }}
      <div
        v-for="item in props.selectedModules"
        :key="item.key"
        class="flex-c relative h-6 rounded-xl bg-sf-theme px-1.5 py-0.5 text-sf-theme-text"
      >
        {{ item.name }}
        <!-- 右上角关闭按钮：点击移除该模块选中 -->
        <SfIcon
          v-if="item.key !== ALL_MODULE_KEY"
          icon="mingcute:close-line"
          size="3"
          class="absolute top-0 right-0 cursor-pointer text-sf-theme-text/70 hover:text-sf-theme-text"
          @click="props.removeModule?.(item.key)"
        />
      </div>
      {{ props.mode === 'chat' ? $t('aiChat_featureChat') : $t('aiChat_featureAgent') }}
    </div>

    <!-- 一键入口放在提示区之后作为收尾操作，加大上边距与说明区拉开距离 -->
    <div
      v-if="oneKeySuggestions.length"
      class="mt-3 flex w-full max-w-md items-center justify-center gap-3"
    >
      <button
        v-for="card in oneKeySuggestions"
        :key="card.flow"
        class="group/card flex w-[140px] cursor-pointer items-center justify-center gap-1 rounded-3xl bg-sf-theme-2 p-2 text-sf-theme-text transition-all duration-300 hover:-translate-y-0.5 hover:bg-sf-theme active:scale-[0.98]"
        @click="handleSuggest(card)"
      >
        <SfIcon :icon="card.icon" size="4.5" />
        <h3 class="text-[14px] font-bold tracking-tight">{{ card.title }}</h3>
      </button>
    </div>

    <OneKeyIntro v-model="introVisible" @confirm="confirmOneKeyIntro" />
  </div>
</template>
