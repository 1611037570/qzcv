<script setup lang="ts">
import { computed, inject, provide } from "vue";
import { storeToRefs } from "pinia";
import AddModel from "./addModel.vue";
import { useAiStore } from "@/stores";
import { PROVIDER_NAMES } from "@/configs";
import { SF_ICON_LIST_KEY } from "@/components/base/icon";
import { AI_BRAND_ICONS, getProviderIcon } from "./providerIcons";
import PencilIcon from "@iconify-vue/lucide/pencil";
import FileTextIcon from "@iconify-vue/lucide/file-text";
import SparklesIcon from "@iconify-vue/lucide/sparkles";

const aiStore = useAiStore();
const { modelList } = storeToRefs(aiStore);

// 本地加载角色与服务商图标，同时保留编辑器已经注入的图标。
provide(SF_ICON_LIST_KEY, {
  ...inject(SF_ICON_LIST_KEY, {}),
  ...AI_BRAND_ICONS,
  "lucide:pencil": PencilIcon, // 文字助手角色图标。
  "lucide:file-text": FileTextIcon, // 文档解析角色图标。
  "lucide:sparkles": SparklesIcon, // 面试辅导角色及其他服务商图标。
});

const agentCards: Array<{
  // 角色使用的稳定标识。
  key: "xiaoZhou" | "xiaoYang" | "resumeParser";
  // 角色展示名称。
  name: string;
  // 角色的主要用途。
  description: string;
  // 项目中已登记的角色图标。
  icon: string;
}> = [
  {
    key: "xiaoZhou",
    name: "简历助手小舟",
    description: "简历制作 · 内容润色 · Markdown 导入",
    icon: "lucide:pencil",
  },
  {
    key: "resumeParser",
    name: "简历解析",
    description: "PDF 导入 · 页面识别与内容提取",
    icon: "lucide:file-text",
  },
  {
    key: "xiaoYang",
    name: "面试官小羊",
    description: "AI 简历面试 · 追问评分与复盘",
    icon: "lucide:sparkles",
  },
];

// 角色选择器展示已添加的模型配置
const modelOptions = computed(() =>
  modelList.value.map((model) => ({
    value: model.id,
    name: model.name || model.model || PROVIDER_NAMES[model.provider] || model.provider,
    providerName: model.builtin
      ? "雪花服务"
      : model.provider === "ark"
        ? "豆包"
        : PROVIDER_NAMES[model.provider] || model.provider, // 选择栏右侧的服务商名称。
    icon: getProviderIcon(model.provider, model.builtin, model.model), // 当前选中项与下拉选项共用的品牌图标。
    iconClass: model.builtin ? "text-sf-theme" : "", // 雪花服务图标使用主题色。
  })),
);

// 卡片展示直接从当前绑定派生，切换或删除模型后同步刷新。
const agentViews = computed(() =>
  agentCards.map((agent) => ({
    ...agent,
    selectedModel: modelOptions.value.find((model) => model.value === getAgentModel(agent.key)), // 当前角色选中的模型及展示信息。
  })),
);

const boundCount = computed(() => agentCards.filter((agent) => getAgentModel(agent.key)).length);
// 模型库直接展示当前角色分配，复用上方角色声明而不再维护一份名称表。
const modelBindings = computed<Record<string, string[]>>(() =>
  Object.fromEntries(
    modelList.value.map((model) => [
      model.id,
      agentCards
        .filter((agent) => getAgentModel(agent.key) === model.id)
        .map((agent) => agent.name),
    ]),
  ),
);
// 统一读写角色绑定模型，卡片只负责展示与选择
function getAgentModel(agent: (typeof agentCards)[number]["key"]) {
  return aiStore.getAgentModelId(agent);
}

function setAgentModel(agent: (typeof agentCards)[number]["key"], modelId: string) {
  aiStore.setAgentModel(agent, modelId);
}
provide("bg", "bg-sf-primary");
</script>

<template>
  <!-- 角色采用独立浅色背景，外层保持主要底色，明确各自的配置范围。 -->
  <div class="ai-settings-content min-w-0 overflow-hidden rounded-2xl border border-sf-b bg-sf-primary">
    <section class="border-b border-sf-b p-3">
      <header class="mb-3 flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-sf-text">角色模型</h2>
        <span class="text-xs text-sf-text-2">已分配 {{ boundCount }}/{{ agentCards.length }}</span>
      </header>
      <div class="agent-assignments grid min-w-0 gap-3">
        <article v-for="agent in agentViews" :key="agent.key" class="flex min-w-0 flex-col gap-[6px] rounded-xl p-3" :class="agent.key === 'xiaoZhou' ? 'bg-sf-theme-3' : agent.key === 'resumeParser' ? 'bg-sf-success-2' : 'bg-sf-warning-2'">
          <header class="flex min-w-0 items-center gap-[6px] text-sf-text">
            <SfIcon :icon="agent.icon" size="4" class="shrink-0" :class="agent.key === 'xiaoZhou' ? 'text-sf-theme' : agent.key === 'resumeParser' ? 'text-sf-success' : 'text-sf-warning'" />
            <h3 class="text-xs font-medium">{{ agent.name }}</h3>
          </header>
          <p class="text-[11px] leading-[18px] text-sf-text-2">{{ agent.description }}</p>
          <SfSelect
            :model-value="getAgentModel(agent.key)"
            :list="modelOptions"
            class="agent-model-select min-w-0 w-full flex-none!"
            :aria-label="`为${agent.name}选择模型`"
            :placeholder="modelOptions.length ? '选择模型' : '先添加模型'"
            clearable
            :disabled="!modelOptions.length"
            @update:model-value="setAgentModel(agent.key, $event)"
          >
            <template v-if="agent.selectedModel" #prefix>
              <!-- 已选雪花服务与下拉选项使用相同颜色。 -->
              <SfIcon :icon="agent.selectedModel.icon" size="4" class="shrink-0" :class="agent.selectedModel.iconClass" />
            </template>
          </SfSelect>
        </article>
      </div>
    </section>
    <AddModel :bindings="modelBindings" />
  </div>
</template>

<style scoped>
/* 按实际容器排列角色，宽屏共用横向设置带，窄屏自然堆叠。 */
.ai-settings-content {
  container: ai-settings / inline-size;
}

@container ai-settings (min-width: 720px) {
  .agent-assignments {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* 选择器使用主要底色，与各角色的浅色背景形成清晰层次。 */
.agent-model-select :deep(.el-select__wrapper) {
  min-height: 36px;
  gap: 6px;
  padding: 6px 9px;
  border: 1px solid var(--color-sf-b);
  border-radius: 9px;
  background-color: var(--color-sf-primary);
  box-shadow: none;
}

.agent-model-select :deep(.el-select__wrapper.is-hovering),
.agent-model-select :deep(.el-select__wrapper.is-focused) {
  border-color: var(--color-sf-theme);
}

.agent-model-select :deep(.el-select__selected-item) {
  font-size: 12px;
}
</style>
