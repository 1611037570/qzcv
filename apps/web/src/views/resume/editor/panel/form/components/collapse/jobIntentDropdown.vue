<script setup>
import { computed } from "vue";
import { useResumeStore } from "@/stores";
import Icon from "../icon.vue";

const resumeStore = useResumeStore();
// 展示模式统一保存在简历级 UI 配置中。
const infoMode = computed({
  get: () => resumeStore.currentUI?.jobIntent?.infoMode || "text", // 当前标签展示方式。
  set: (value) => {
    const ui = resumeStore.currentUI;
    if (!ui) return;
    ui.jobIntent.infoMode = value;
  }, // 只修改求职意向的标签展示方式。
});
const modes = [
  { value: "text" /* 文字标签模式。 */, label: "jobIntentModeText" /* 文字模式名称。 */ },
  { value: "icon" /* 图标标签模式。 */, label: "jobIntentModeIcon" /* 图标模式名称。 */ },
  { value: "none" /* 隐藏字段标签。 */, label: "jobIntentModeNone" /* 仅内容模式名称。 */ },
];
</script>

<template>
  <!-- 设置入口不会触发模块折叠。 -->
  <span class="flex items-center" @click.stop @mousedown.stop>
    <SfDropdown trigger="click" placement="bottom-start" :show-arrow="false" :hide-on-click="false">
      <SfTooltip :content="$t('jobIntentDisplay')">
        <Icon click-through icon="lucide:settings-2" :aria-label="$t('jobIntentDisplay')" aria-haspopup="menu" />
      </SfTooltip>
      <template #dropdown>
        <div class="flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3">
          <p class="text-xs text-sf-text-2">{{ $t('jobIntentDisplay') }}</p>
          <div class="flex gap-3">
            <button v-for="mode in modes" :key="mode.value" type="button" class="cursor-pointer rounded-lg border px-3 py-[6px] text-xs transition-colors" :class="infoMode === mode.value ? 'border-sf-theme bg-sf-theme-3 text-sf-theme' : 'border-sf-b text-sf-text-2 hover:bg-sf-bg'" :aria-pressed="infoMode === mode.value" @click="infoMode = mode.value">
              {{ $t(mode.label) }}
            </button>
          </div>
        </div>
      </template>
    </SfDropdown>
  </span>
</template>
