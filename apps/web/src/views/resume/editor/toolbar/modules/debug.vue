<template>
  <!-- 调试控制台按钮：是否显示由系统设置中的「调试控制台」开关控制 -->
  <Icon
    v-if="system.showDebug"
    icon="mdi:console-line"
    size="5"
    :content="$t('debugConsole')"
    :active="drawerVisible"
    @click="drawerVisible = !drawerVisible"
  />

  <!-- 抽屉挂到 body：工具栏容器带 transform，若不脱离会按工具栏宽度计算尺寸 -->
  <el-drawer v-model="drawerVisible" append-to-body :title="$t('debug_consoleTitle')" direction="rtl" :size="isMobile ? '100%' : '50%'" destroy-on-close>
    <div v-if="drawerVisible" class="flex flex-col gap-3 p-3">
      <SfTab :list="tabList" v-model="activeTab">
        <SfTabPane value="performance">
          <SfCollapse v-model="performanceActiveNames">
            <SfCollapseItem name="runtime">
              <template #title>{{ $t("debug_runtimeDataTitle") }}</template>
              <div class="flex flex-col gap-3">
                <div
                  v-for="item in performanceRows"
                  :key="item.label"
                  class="flex items-center justify-between gap-3 rounded-2xl bg-sf-bg px-3 py-2"
                >
                  <span class="text-sm text-sf-text-2">{{ item.label }}</span>
                  <span class="text-sm font-medium">{{ item.value }}</span>
                </div>
              </div>
            </SfCollapseItem>
            <SfCollapseItem name="env">
              <template #title>{{ $t("debug_envTitle") }}</template>
              <SfMdPreview
                :modelValue="fieldMd(runtimeData.env)"
                editorId="debug-env"
                :codeFoldable="false"
                class="bg-transparent! p-0!"
              />
            </SfCollapseItem>
          </SfCollapse>
        </SfTabPane>
        <SfTabPane value="data">
          <SfCollapse v-model="dataActiveNames">
            <!-- 顶层 key 各自独立折叠，便于只看某一项数据 -->
            <SfCollapseItem v-for="(value, key) in currentData ?? {}" :key="key" :name="key">
              <template #title>{{ key }}</template>
              <SfMdPreview
                :modelValue="fieldMd(value)"
                :editorId="`debug-raw-${key}`"
                :codeFoldable="false"
                class="bg-transparent! p-0!"
              />
            </SfCollapseItem>
          </SfCollapse>
        </SfTabPane>
        <SfTabPane value="ui">
          <SfCollapse v-model="uiActiveNames">
            <!-- 界面配置按顶层 key 独立折叠，与数据 Tab 保持一致 -->
            <SfCollapseItem v-for="(value, key) in currentUI ?? {}" :key="key" :name="key">
              <template #title>{{ key }}</template>
              <SfMdPreview
                :modelValue="fieldMd(value)"
                :editorId="`debug-ui-${key}`"
                :codeFoldable="false"
                class="bg-transparent! p-0!"
              />
            </SfCollapseItem>
          </SfCollapse>
        </SfTabPane>
        <SfTabPane value="config">
          <!-- 按模块拆开，避免整份表单结构挤在一个代码块里 -->
          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-medium text-sf-text-2">{{ $t("debug_runtimeConfigTitle") }}</h3>
            <SfCollapse v-model="runtimeActiveNames">
              <SfCollapseItem v-for="module in runtimeModules" :key="module.key" :name="module.key">
                <template #title>{{ module.key }}</template>
                <SfMdPreview
                  :modelValue="fieldMd(module)"
                  :editorId="`debug-runtime-${module.key}`"
                  :codeFoldable="false"
                  class="bg-transparent! p-0!"
                />
              </SfCollapseItem>
            </SfCollapse>
            <h3 class="text-xs font-medium text-sf-text-2">{{ $t("debug_currentConfigTitle") }}</h3>
            <SfCollapse v-model="configActiveNames">
              <SfCollapseItem v-for="module in currentModules" :key="module.key" :name="module.key">
                <template #title>{{ module.key }}</template>
                <SfMdPreview
                  :modelValue="fieldMd(module)"
                  :editorId="`debug-config-${module.key}`"
                  :codeFoldable="false"
                  class="bg-transparent! p-0!"
                />
              </SfCollapseItem>
            </SfCollapse>
          </div>
        </SfTabPane>
        <SfTabPane value="usage">
          <SfCollapse v-model="usageActiveNames">
            <!-- 使用信息按顶层 key 独立折叠，与界面 Tab 保持一致 -->
            <SfCollapseItem v-for="(value, key) in currentUsage ?? {}" :key="key" :name="key">
              <template #title>{{ key }}</template>
              <SfMdPreview
                :modelValue="fieldMd(value)"
                :editorId="`debug-usage-${key}`"
                :codeFoldable="false"
                class="bg-transparent! p-0!"
              />
            </SfCollapseItem>
          </SfCollapse>
        </SfTabPane>
        <SfTabPane value="chat">
          <SfCollapse v-model="chatActiveNames">
            <SfCollapseItem name="assistantChat">
              <template #title>
                <div class="flex w-full items-center justify-between gap-3">
                  <span>{{ $t("debug_chatTitle") }}</span>
                  <span
                    v-if="resumeAssistantChat"
                    class="shrink-0 rounded-full bg-sf-theme px-3 text-xs text-sf-theme-text"
                  >
                    {{ $t("debug_inUse") }}
                  </span>
                </div>
              </template>
              <div v-if="!chatMessages.length" class="text-sm text-sf-text-3">{{ $t("debug_noMessages") }}</div>
              <div v-else class="max-h-[50vh] overflow-y-auto">
                <div v-for="(msg, index) in chatMessages" :key="index" class="mb-3">
                  <!-- 消息摘要行：点击展开该条消息的完整 JSON 便于排查 -->
                  <div
                    class="flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl bg-sf-bg px-3 py-2 transition-colors hover:bg-sf-bg-2"
                    @click="toggleMsgJson(index)"
                  >
                    <span class="shrink-0 text-sm font-medium">{{ msg.role }}</span>
                    <span class="shrink-0 text-xs text-sf-text-3">{{ msg.requestStatus }}</span>
                    <span class="min-w-0 flex-1 truncate text-sm whitespace-nowrap text-sf-text-2">
                      {{ msgBrief(msg) }}
                    </span>
                    <SfTooltip :content="$t('debug_deleteMessageTip')">
                      <button
                        type="button"
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sf-text-3 transition-colors hover:bg-sf-error-2 hover:text-sf-error"
                        @click.stop="handleDeleteMsg(index)"
                      >
                        <SfIcon icon="ic:round-delete" size="4" />
                      </button>
                    </SfTooltip>
                  </div>
                  <SfMdPreview
                    v-if="activeMsgIndex === index"
                    :modelValue="fieldMd(msg)"
                    editorId="debug-chat"
                    :codeFoldable="false"
                    class="mt-3 bg-transparent! p-0!"
                  />
                </div>
              </div>
            </SfCollapseItem>
          </SfCollapse>
        </SfTabPane>
      </SfTab>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, ref } from "vue";
import { useAiStore, useResumeStore, useSystemStore } from "@/stores";
import { storeToRefs } from "pinia";
import confirm from "@/components/business/confirm";
import { $t } from "@/locales";
import Icon from "../components/icon.vue";

const drawerVisible = ref(false);
// 移动端抽屉全屏展示，避免半屏宽度下内容被压缩
const systemStore = useSystemStore();
const { isMobile } = storeToRefs(systemStore);
// 数据和界面 Tab 均按顶层 key 各自折叠
const dataActiveNames = ref([]);
const uiActiveNames = ref([]);
const usageActiveNames = ref([]);
const runtimeActiveNames = ref([]);
const configActiveNames = ref([]);

// 顶部 Tab：性能 / 数据 / 界面 / 配置 / 消息对话
const activeTab = ref("performance");
const tabList = computed(() => [
  { name: $t("debug_tabPerformance"), value: "performance" },
  { name: $t("debug_tabData"), value: "data" },
  { name: $t("debug_tabUi"), value: "ui" },
  { name: $t("debug_tabConfig"), value: "config" },
  { name: $t("debug_tabUsage"), value: "usage" },
  { name: $t("debug_tabChat"), value: "chat" },
]);
// 性能折叠面板：默认展开
const performanceActiveNames = ref(["runtime", "env"]);

// 获取原始数据
const resumeStore = useResumeStore();
const { currentData, currentConfig, currentUI, currentUsage, runtimeConfig, system, runtimeData } =
  storeToRefs(resumeStore);

// 配置按模块拆开展示：运行时结构在 fields 上，持久化结构在 modules 上
const runtimeModules = computed(() => runtimeConfig.value?.fields ?? []);
const currentModules = computed(() => currentConfig.value?.modules ?? []);

// 运行性能数据展示：耗时统一按毫秒展示
const performanceRows = computed(() => {
  const data = runtimeData.value;
  const time = (value) => (value ? `${value}ms` : "—");
  return [
    { label: $t("debug_editorLoadTime"), value: time(data.editorDuration) },
    { label: $t("debug_previewLoadTime"), value: time(data.previewDuration) },
    { label: $t("debug_firstFrame"), value: time(data.firstFrame) },
  ];
});

// 获取简历助手的 LLM 对话（编辑器当前正在使用的对话）
const aiStore = useAiStore();
const { resumeAssistantChat } = storeToRefs(aiStore);
const chatMessages = computed(() => resumeAssistantChat.value?.messages ?? []);

// 当前展开查看 JSON 的消息下标：-1 表示未展开
const activeMsgIndex = ref(-1);
// 消息对话折叠面板：默认展开
const chatActiveNames = ref(["assistantChat"]);

// 消息摘要：压缩为单行便于列表展示
const msgBrief = (msg) => {
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
  return content.replace(/\s+/g, " ").trim();
};

// 点击消息摘要行：切换展开/收起该条消息的完整 JSON
const toggleMsgJson = (index) => {
  activeMsgIndex.value = activeMsgIndex.value === index ? -1 : index;
};

// 删除消息：删除后关闭展开的 JSON 预览
function handleDeleteMsg(index) {
  confirm($t("debug_deleteConfirm"), $t("debug_deleteMessageTitle"))
    .then(() => {
      const chat = resumeAssistantChat.value;
      if (!chat) return;
      chat.messages.splice(index, 1);
      chat.updateTime = Date.now();
      activeMsgIndex.value = -1;
    })
    .catch(() => {});
}

// 包装为 markdown json 代码块
const wrapJson = (str) => "```json\n" + str + "\n```";

// 单个字段值包装为 markdown json 代码块：按顶层 key 分别预览，避免整份数据整体序列化
const fieldMd = (value) => {
  try {
    return wrapJson(JSON.stringify(value ?? null, null, 2));
  } catch (e) {
    return wrapJson(String(e));
  }
};
</script>
