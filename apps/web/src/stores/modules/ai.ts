import { getUUID } from "@/utils";
import { del, get, set } from "idb-keyval";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useResumeStore } from "@/stores/modules/resume";
import type { AiChatSummary } from "@/stores/modules/resume/resumeCatalog";
import type { ResumeAgentTaskState, ResumeAssistantMode } from "@snowflake/resume-agent";
import { SNOWFLAKE_MODELS, snowflake } from "@/configs/modules/ai";
import { $t } from "@/locales";
export type Chat = {
  // 对话记录id
  id: string;
  // 关联简历id
  resumeId?: string;
  // 会话创建时确定的固定类型。
  mode: ResumeAssistantMode;
  // 对话记录标题
  title: string;
  // 创建时间
  createTime: number;
  // 更新时间
  updateTime: number;
  // 消息列表
  messages: Message[];
};
export type ResumeAssistantChatRecord = Omit<Chat, "resumeId"> & { resumeId: string };
// 一次工具执行留下的观测记录
export type ResumeAgentRunStep = {
  // 证据执行序号
  sequence: number;
  // 工具名称
  tool: string;
  // 执行结果状态
  status: string;
  // 面向用户的结果摘要
  summary: string;
  // 本次工具执行是否真实改变业务数据。
  changed?: boolean;
  // 结果额外证明的业务事实
  facts?: string[];
  // 是否复用了首次执行结果
  replayed?: boolean;
  // 记录时间
  at: number;
};
// 一轮请求的 Agent 运行观测
export type ResumeAgentRunTrace = {
  // 任务标识
  taskId: string;
  // 功能入口
  source: string;
  // 请求开始时间
  startedAt: number;
  // 请求总耗时毫秒
  durationMs?: number;
  // 本轮 token 用量
  tokens?: number;
  // 最终任务快照
  task?: ResumeAgentTaskState;
  // 工具证据时间线
  steps: ResumeAgentRunStep[];
  // 完成校验结论
  verdicts: Array<{ completed: boolean; reason: string | null; at: number }>;
  // 降级说明
  note?: string;
};
export type Message = {
  // 消息唯一标识
  id: string;
  // 创建时间
  createTime: number;
  // 角色
  role: string;
  // 消息内容
  content: string;
  // 系统技能稳定标识，用于替换已迭代的旧版系统提示
  systemSkillId?: string;
  // 是否正在输入中
  typing: boolean;
  // 思考内容
  thought: string;
  // 当前执行阶段的动态提示（如正在读取简历数据）
  stepLabel?: string;
  // 推荐追问：由请求流程补充记录，不再等待模型在 JSON 中返回
  followQuestions: string[];
  // 思考内容是否折叠
  thoughtCollapsed: boolean;
  // 总token数
  total_tokens: number;
  // 思考耗时（秒）
  thoughtTime: number;
  // 内容耗时（秒）
  contentTime: number;
  // 内容是否折叠
  contentCollapsed: boolean;
  // 请求状态
  requestStatus: string;
  // 上下文标记：为 true 时仅作界面展示，不随请求发送给模型
  skipContext?: boolean;
  // 本轮工具确认实际写入，用于重试保护；撤回仍依赖会话内存备份
  hasWriteChanges?: boolean;
  // 本轮写入结果摘要，用于完成后向用户说明实际改动
  writeSummary?: string;
  // 本轮 Agent 任务契约，用于后续“继续”等承接表达恢复目标、范围与必需效果。
  resumeTask?: ResumeAgentTaskState;
  // 本轮 Agent 运行观测，用于排障展示与复制导出。
  agentRun?: ResumeAgentRunTrace;
  // 由业务宿主解释的请求上下文，重试与重新生成时保持一致
  requestContext?: Record<string, unknown>;
};
export type ModelProtocol = "chatCompletions" | "responses";
// 服务商密钥独立于模型保存，配置好密钥后才能读取目录或添加模型。
export type ProviderCredential = {
  /** 当前服务商的访问密钥。 */
  key: string;
  /** 当前服务商的完整请求地址。 */
  url: string;
  /** 新添加模型默认使用的请求协议。 */
  protocol: ModelProtocol;
};
// 模型条目：平台内置模型与用户自行添加的模型共用同一结构
export type ModelItem = {
  // 模型唯一标识
  id: string;
  // 平台类型
  provider: string;
  // 别名（可选，展示优先用这个）
  name?: string;
  // 模型标识
  model: string;
  // API 密钥
  key: string;
  // 完整接口地址
  url: string;
  // 接口协议类型
  protocol: ModelProtocol;
  // 是否为内置服务
  builtin?: boolean;
};
export type AiAgentKey = "xiaoZhou" | "xiaoYang" | "resumeParser";
export type AiAgentModels = Record<AiAgentKey, string>;
// 添加模型时提交的配置（表单或内置模板，不含 id）
type ModelDraft = Omit<ModelItem, "id">;
// 每个角色默认使用的内置模型
const DEFAULT_AGENT_MODEL: AiAgentModels = {
  xiaoZhou: "builtin-assistant", // 简历助手使用助手模型
  xiaoYang: "builtin-assistant", // 面试官使用助手模型
  resumeParser: "builtin-parser", // 简历解析使用解析模型
};
// 默认对话记录标题
const DEFAULT_CHAT_TITLE = "新对话";
// 默认系统提示
const DEFAULT_SYSTEM_PROMPT =
  "你的设置是：名字叫小羊，性别男，巨蟹座，2000年生，工作是前端工程师，擅长vue typescript，说话直接清爽，不拖沓、不矫情，回答简洁准确。回答以这个设定为基础。";

// 简历助手会话工厂：由简历助手组装器注册，Pinia 只负责调用
let resumeAssistantChatFactory: ((mode: ResumeAssistantMode) => Chat) | null = null;
let resumeAssistantChatLoadId = 0;
const resumeAssistantChatKey = (id: string) => `resume-assistant-chat:${id}`;

export const useAiStore = defineStore(
  "ai",
  () => {
    // 平台内置的两个模型：固定存在、不可删除，请求统一经本站后端转发
    const builtinModels = computed<ModelItem[]>(() => [
      {
        id: DEFAULT_AGENT_MODEL.xiaoZhou, // 内置助手模型标识
        provider: snowflake.provider, // 平台类型
        name: $t("snowflakeModelAssistant"), // 展示名称
        model: SNOWFLAKE_MODELS.assistant, // 服务端据此路由到助手对应的上游模型
        key: snowflake.apiKey, // 访问密钥（占位）
        url: snowflake.baseUrl, // 完整接口地址
        protocol: snowflake.protocol, // 接口协议类型
        builtin: true, // 标记为平台内置
      },
      {
        id: DEFAULT_AGENT_MODEL.resumeParser, // 内置解析模型标识
        provider: snowflake.provider, // 平台类型
        name: $t("snowflakeModelParser"), // 展示名称
        model: SNOWFLAKE_MODELS.parser, // 服务端据此路由到解析对应的上游模型
        key: snowflake.apiKey, // 访问密钥（占位）
        url: snowflake.baseUrl, // 完整接口地址
        protocol: snowflake.protocol, // 接口协议类型
        builtin: true, // 标记为平台内置
      },
    ]);
    // 用户自行添加的模型（持久化），由浏览器带自己的密钥直连服务商，不经过本站后端
    // 不兼容旧版本地存储：历史上混合内置项的 modelList 直接丢弃，用户重新添加即可
    const storedModels = ref<ModelItem[]>([]);
    // 服务商凭据单独持久化，尚未添加模型也能保存密钥。
    const providerCredentials = ref<Record<string, ProviderCredential>>({});
    // 对外统一列表：平台内置在前，用户自建在后
    const modelList = computed<ModelItem[]>(() => [...builtinModels.value, ...storedModels.value]);
    // 小舟负责简历、小羊负责面试，各自独立绑定模型。
    const agentModels = ref<AiAgentModels>({
      xiaoZhou: "", // 简历助手小舟绑定的模型编号。
      xiaoYang: "", // 面试官小羊绑定的模型编号。
      resumeParser: "", // 简历解析绑定的模型编号。
    });

    // 是否开启思考模式：默认快速模式，需要深度思考时由开关开启
    const thinkMode = ref<boolean>(false);
    // 当前简历助手对话只在运行时加载，正文按会话 ID 独立保存到 IndexedDB
    const resumeAssistantChat = ref<ResumeAssistantChatRecord | null>(null);
    // 会话摘要从简历目录动态汇总，不在 ai store 重复持久化
    const resumeAssistantChatList = computed(() =>
      useResumeStore().list.flatMap((resume) =>
        resume.ai.map((chat) => ({ ...chat, resumeId: resume.id })),
      ),
    );

    // 创建默认对话
    function createDefaultChat(message?: any): Chat {
      // 当前时间戳
      const now = Date.now();
      // 默认对话记录
      const msg = createDefaultMessage();
      const newChat: Chat = {
        id: getUUID().substring(0, 8),
        mode: "agent", // 新建会话默认使用智能体类型。
        title: DEFAULT_CHAT_TITLE,
        createTime: now,
        updateTime: now,
        messages: [
          {
            ...msg,
            createTime: now,
            role: "system",
            content: DEFAULT_SYSTEM_PROMPT,
            typing: false,
            ...message,
          },
        ],
      };
      return newChat;
    }
    // 创建默认消息
    function createDefaultMessage() {
      const message: Message = {
        id: `msg-${getUUID().slice(0, 8)}`,
        createTime: Date.now(),
        contentCollapsed: false,
        thoughtCollapsed: false,
        total_tokens: 0,
        thoughtTime: 0,
        contentTime: 0,
        thought: "",
        followQuestions: [],
        content: "",
        typing: false,
        role: "",
        requestStatus: "loading",
      };
      return message;
    }
    // 为旧持久化消息补齐唯一标识，保证迁移后预览实例仍可稳定复用
    function ensureMessageIds(chat: Chat) {
      const ids = new Set<string>();
      chat.messages.forEach((message) => {
        let id = message.id;
        while (!id || ids.has(id)) id = `msg-${getUUID().slice(0, 8)}`;
        message.id = id;
        ids.add(id);
      });
    }
    // 注册简历助手会话工厂，供“新建话题”等入口直接调用
    function registerResumeAssistantChatFactory(factory: (mode: ResumeAssistantMode) => Chat) {
      resumeAssistantChatFactory = factory;
    }
    // 加载指定简历的最近会话正文；没有会话时保持空状态
    async function initializeResumeAssistantChat(resumeId: string, chatId?: string) {
      const loadId = ++resumeAssistantChatLoadId;
      resumeAssistantChat.value = null;
      const summaries = useResumeStore().list.find((resume) => resume.id === resumeId)?.ai || [];
      const summary = summaries.find((chat) => chat.id === chatId) || summaries[0];
      if (!summary) {
        resumeAssistantChat.value = null;
        return null;
      }
      const chat = await get<ResumeAssistantChatRecord>(resumeAssistantChatKey(summary.id));
      if (loadId !== resumeAssistantChatLoadId) return null;
      if (!chat || chat.id !== summary.id || chat.resumeId !== resumeId) {
        resumeAssistantChat.value = null;
        return null;
      }
      ensureMessageIds(chat);
      resumeAssistantChat.value = chat;
      return chat;
    }
    // 切换当前简历下的助手话题
    async function switchResumeAssistantChat(id: string) {
      const resumeId = useResumeStore().currentItem?.id;
      if (!resumeId) return null;
      return initializeResumeAssistantChat(resumeId, id);
    }
    // 创建未持久化的简历助手话题草稿
    function createNewResumeAssistantChat(mode: ResumeAssistantMode = "agent") {
      if (!resumeAssistantChatFactory) return;
      return resumeAssistantChatFactory(mode);
    }
    // 首次产生用户消息后保存简历助手话题
    async function saveResumeAssistantChat(chat: Chat) {
      if (!chat.resumeId) return null;
      const directory = useResumeStore().list.find((resume) => resume.id === chat.resumeId);
      if (!directory || directory.deletedAt !== null) return null;
      const record = chat as ResumeAssistantChatRecord;
      const loadId = resumeAssistantChatLoadId;
      await set(
        resumeAssistantChatKey(chat.id),
        JSON.parse(JSON.stringify(record)) as ResumeAssistantChatRecord,
      );
      const updated = await useResumeStore().updateResumeAiChatSummary(chat.resumeId, {
        id: chat.id,
        title: chat.title,
        mode: chat.mode, // 摘要直接保存会话类型。
        createTime: chat.createTime,
        updateTime: chat.updateTime,
      } satisfies AiChatSummary);
      if (!updated) {
        await del(resumeAssistantChatKey(chat.id));
        return null;
      }
      // 保存旧草稿完成时不得覆盖后来切换的简历或话题
      if (loadId === resumeAssistantChatLoadId && useResumeStore().currentItem?.id === chat.resumeId) {
        resumeAssistantChat.value = record;
      }
      return chat;
    }
    // 持久化已创建的会话正文及目录摘要
    async function persistResumeAssistantChat(chat: Chat) {
      if (!chat.resumeId) return;
      const directory = useResumeStore().list.find((resume) => resume.id === chat.resumeId);
      if (!directory || directory.deletedAt !== null) return;
      const record = chat as ResumeAssistantChatRecord;
      await set(
        resumeAssistantChatKey(chat.id),
        JSON.parse(JSON.stringify(record)) as ResumeAssistantChatRecord,
      );
      await useResumeStore().updateResumeAiChatSummary(chat.resumeId, {
        id: chat.id,
        title: chat.title,
        mode: chat.mode, // 与正文保持相同的固定类型。
        createTime: chat.createTime,
        updateTime: chat.updateTime,
      });
    }
    // 按会话 ID 读取完整正文，供历史会话查看使用
    function getResumeAssistantChat(id: string) {
      return get<ResumeAssistantChatRecord>(resumeAssistantChatKey(id));
    }
    // 彻底删除简历时清理其关联会话正文和目录摘要
    async function removeResumeAssistantChats(resumeId: string) {
      const resumeStore = useResumeStore();
      const ids = resumeStore.list.find((resume) => resume.id === resumeId)?.ai.map((chat) => chat.id) || [];
      await Promise.all(ids.map((id) => del(resumeAssistantChatKey(id))));
      await resumeStore.clearResumeAiChatSummaries(resumeId);
      if (resumeAssistantChat.value?.resumeId === resumeId) {
        resumeAssistantChat.value = null;
      }
    }
    // 软删除只清除当前运行时指针，保留 IndexedDB 会话和目录摘要
    function clearCurrentResumeAssistantChat(resumeId: string) {
      if (resumeAssistantChat.value?.resumeId === resumeId) {
        resumeAssistantChat.value = null;
      }
    }
    // 首条用户消息生成简历助手话题标题
    function updateResumeAssistantChatTitle(chat: Chat) {
      if (chat.title !== DEFAULT_CHAT_TITLE) return;
      const firstUserMsg = chat.messages.find((message) => message.role === "user");
      if (!firstUserMsg) return;
      const content = firstUserMsg.content;
      chat.title = content.length > 15 ? `${content.slice(0, 15)}...` : content;
    }

    // ========== 角色与模型 ==========

    // 保存用户明确提交的服务商配置，不覆盖已有模型的独立配置。
    function saveProviderCredential(provider: string, credential: ProviderCredential) {
      providerCredentials.value[provider] = {
        key: credential.key.trim(), // 去除复制密钥时带入的空白。
        url: credential.url.trim(), // 保存本服务商完整请求地址。
        protocol: credential.protocol, // 新模型沿用该服务商选择的协议。
      };
    }

    /** 部署表单提交的配置到用户自建列表，平台内置模型不经过此处 */
    function deployModel(draft: ModelDraft) {
      const deployed: ModelItem = {
        id: `custom-${getUUID().slice(0, 8)}`,
        provider: draft.provider,
        name: draft.name || undefined,
        model: draft.model,
        key: draft.key,
        url: draft.url,
        protocol: draft.protocol,
        builtin: draft.builtin,
      };
      storedModels.value.push(deployed);
      return deployed;
    }

    /** 删除用户自建的模型；平台内置模型不在自建列表里，天然无法删除 */
    function deleteModel(modelId: string) {
      const idx = storedModels.value.findIndex((model) => model.id === modelId);
      if (idx > -1) {
        storedModels.value.splice(idx, 1);
      }
      // 同步解绑引用了该模型的角色，避免删除后仍保持选中态
      (Object.keys(agentModels.value) as AiAgentKey[]).forEach((agent) => {
        if (agentModels.value[agent] === modelId) agentModels.value[agent] = "";
      });
    }

    // 获取角色绑定的模型：存储里可能残留已下线的标识，统一回落到默认内置模型
    function getAgentModelId(agent: AiAgentKey) {
      const current = agentModels.value[agent];
      if (current && modelList.value.some((model) => model.id === current)) return current;
      return modelList.value.length ? DEFAULT_AGENT_MODEL[agent] : "";
    }

    // 保存角色绑定的模型
    function setAgentModel(agent: AiAgentKey, modelId: string) {
      agentModels.value[agent] = modelId;
    }

    // 服务商设置弹窗：显隐与当前 Tab（工具栏入口与聊天输入「去添加模型」共用）
    const modelManagerVisible = ref(false);
    const modelManagerTab = ref<"added" | "add">("added");

    /** 打开服务商设置弹窗，可指定初始 Tab */
    function openModelManager(tab: "added" | "add" = "added") {
      modelManagerTab.value = tab;
      modelManagerVisible.value = true;
    }

    return {
      modelList,
      storedModels,
      providerCredentials,
      agentModels,
      thinkMode,
      resumeAssistantChat,
      resumeAssistantChatList,
      createDefaultChat,
      createDefaultMessage,
      registerResumeAssistantChatFactory,
      initializeResumeAssistantChat,
      createNewResumeAssistantChat,
      saveResumeAssistantChat,
      persistResumeAssistantChat,
      switchResumeAssistantChat,
      getResumeAssistantChat,
      removeResumeAssistantChats,
      clearCurrentResumeAssistantChat,
      updateResumeAssistantChatTitle,
      deployModel,
      saveProviderCredential,
      deleteModel,
      getAgentModelId,
      setAgentModel,
      modelManagerVisible,
      modelManagerTab,
      openModelManager,
    };
  },
  {
    persist: {
      // 简历助手对话一并持久化到 localStorage，刷新后可恢复最近对话
      storage: localStorage,
      // 这里的键必须与 setup 返回值一致，否则插件取不到也不会报错，数据会静默丢失。
      pick: [
        // 只持久化用户自建模型；平台内置模型由前端常量提供，不写入本地存储
        "storedModels",
        "providerCredentials",
        "agentModels",
        "thinkMode",
      ],
    },
  },
);
