<script setup>
import { storeToRefs } from "pinia";
import { useSystemStore } from "@/stores/modules/system";

const { pastePlainText } = storeToRefs(useSystemStore());

// 切换共享设置，让所有编辑器立即使用同一规则。
const togglePastePlainText = () => { pastePlainText.value = !pastePlainText.value; };
</script>

<template>
  <!-- 两种编辑视图共用开关，按下时保留正文选区。 -->
  <SfTooltip :content="$t(pastePlainText ? 'pastePlainTextEnabled' : 'pastePlainTextDisabled')">
    <button
      type="button"
      class="flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-full px-[3px] hover:text-sf-theme"
      :class="pastePlainText ? 'text-sf-theme' : 'text-sf-text-2'"
      :aria-label="$t('pastePlainText')"
      :aria-pressed="pastePlainText"
      @mousedown.prevent
      @click="togglePastePlainText"
    >
      <SfIcon icon="lucide:clipboard-paste" size="4" />
    </button>
  </SfTooltip>
</template>
