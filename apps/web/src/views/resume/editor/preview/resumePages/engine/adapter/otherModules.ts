import { getValidData, getValidDataEntries, isContentEmpty } from "@/views/resume/shared/validData";
import { RESUME_MODULES, type ResumeModulePreview } from "@/stores/modules/resume/config/moduleRegistry";
import type { LayoutNode } from "../types";
import type { LayoutAdapter, LayoutAdapterContext, LayoutAdapterRegistry } from "./index";
import { createExperienceModuleAdapter } from "./experienceModules";
import { parseRichText } from "./richTextParser";

/** 创建个人信息模块适配器 */
const createUserModuleAdapter = (context: LayoutAdapterContext): LayoutNode[] => {
  const moduleData = context.data.user;
  const userData = getValidData((moduleData as { data?: unknown })?.data);
  if (!userData || typeof userData !== "object" || Array.isArray(userData)) return [];

  const hasUserField = Object.values(userData as Record<string, unknown>).some(
    (value) => value !== undefined && value !== null && value !== "",
  );
  if (!hasUserField) return [];

  return [
    {
      id: "user",
      sourceModuleKey: "user",
      type: "group",
      contentKind: "user", // 个人信息内容语义
      payload: { moduleKey: "user" },
    },
  ];
};

/** 创建顶部标语模块适配器 */
const createSloganModuleAdapter = (context: LayoutAdapterContext): LayoutNode[] => {
  const moduleData = context.data.slogan;
  const sloganData = getValidData((moduleData as { data?: unknown })?.data);
  const hasSloganField =
    sloganData && typeof sloganData === "object" && !Array.isArray(sloganData) &&
    Object.values(sloganData as Record<string, unknown>).some(
      (value) => value !== undefined && value !== null && value !== "",
    );
  if (!hasSloganField) return [];

  return [
    {
      id: "slogan",
      sourceModuleKey: "slogan",
      type: "group",
      contentKind: "slogan", // 用户标语内容语义
      payload: { moduleKey: "slogan" },
    },
  ];
};

/** 创建账号、荣誉等普通列表模块适配器 */
const createListModuleAdapter =
  (moduleKey: string): LayoutAdapter =>
  (context) => {
    const moduleData = context.data[moduleKey];
    if (!moduleData || typeof moduleData !== "object") return [];
    const list = getValidDataEntries((moduleData as { list?: unknown }).list);

    return list.map(({ data: item, index }) => ({
      id: `${moduleKey}.item-${index}`,
      sourceModuleKey: moduleKey,
      sourceItemIndex: index,
      type: "block" as const,
      contentKind: moduleKey, // 账号与荣誉使用对应语义组件
      payload: {
        part: "item",
        item,
      },
    }));
  };

/** 创建带描述正文的条目模块适配器：名称行构成条目头，描述正文参与分片（荣誉条目使用） */
const createDescribedItemModuleAdapter =
  (moduleKey: string): LayoutAdapter =>
  (context) => {
    const moduleData = context.data[moduleKey];
    if (!moduleData || typeof moduleData !== "object") return [];
    const list = getValidDataEntries((moduleData as { list?: unknown }).list);
    const honorUi = context.ui?.honor as { layout?: "default" | "tag" | "notion" | "rainbowTag" | "list" | "card" /* 荣誉证书布局 */ } | undefined;

    // 标签类与笔记风将可见荣誉合为一个节点，由公共组件决定是否显示描述。
    if (moduleKey === "honor" && ["tag", "notion", "rainbowTag"].includes(honorUi?.layout ?? "")) {
      const entries = list.filter(({ data }) => typeof data.name === "string" && data.name.trim());
      if (!entries.length) return [];
      return [{
        id: `${moduleKey}.${honorUi.layout}`,
        sourceModuleKey: moduleKey,
        sourceItemIndex: entries[0].index,
        type: "block" as const,
        contentKind: moduleKey,
        payload: {
          part: "item" as const, // 标签类布局按整组荣誉渲染。
          item: entries[0].data, // 保留首个条目供主题组件读取。
          items: entries.map(({ data }) => ({
            name: data.name, // 荣誉名称供三种成组布局展示。
            desc: data.content, // 荣誉描述仅由笔记风展示。
          })),
          honorLayout: honorUi.layout, // 当前节点使用的荣誉布局。
        },
      }];
    }

    // 清单按单条荣誉生成节点，仅显示名称，分页时可逐条移动。
    if (moduleKey === "honor" && honorUi?.layout === "list") {
      return list.filter(({ data }) => typeof data.name === "string" && data.name.trim()).map(({ data, index }) => ({
        id: `${moduleKey}.item-${index}`,
        sourceModuleKey: moduleKey,
        sourceItemIndex: index,
        type: "block" as const,
        contentKind: moduleKey,
        payload: {
          part: "item" as const, // 清单中的单条荣誉。
          item: { name: data.name }, // 清单只传荣誉名称。
          honorLayout: "list" as const, // 当前节点使用清单布局。
        },
      }));
    }

    return list.map(({ data: item, index }) => {
      const content = typeof item.content === "string" ? item.content : "";
      // 描述正文参与分片：断点与首段截取共用同一份解析结果
      const parsed = isContentEmpty(content) ? undefined : parseRichText(content);
      const isCard = moduleKey === "honor" && honorUi?.layout === "card";

      return {
        id: `${moduleKey}.item-${index}`,
        sourceModuleKey: moduleKey,
        sourceItemIndex: index,
        type: "block" as const,
        contentKind: moduleKey,
        splitMode: isCard ? "whole" as const : undefined, // 详情卡片与边框作为整块分页。
        payload: {
          part: "item" as const,
          item,
          content: parsed,
          honorLayout: isCard ? "card" as const : undefined, // 详情卡片使用独立外观。
        },
        // 正文起点也作为断点：放不下描述时允许名称行留在当前页，描述顺延到下一页
        breakPoints: parsed && !isCard
          ? [{ offset: 0, type: "paragraph" as const }, ...parsed.breakPoints]
          : undefined,
      };
    });
  };

/** 创建作品集媒体模块适配器 */
const createMediaModuleAdapter =
  (moduleKey: string): LayoutAdapter =>
  (context) => {
    const moduleData = context.data[moduleKey];
    if (!moduleData || typeof moduleData !== "object") return [];
    const list = getValidDataEntries((moduleData as { list?: unknown }).list);

    return list.map(({ data: item, index }) => ({
      id: `${moduleKey}.media-${index}`,
      sourceModuleKey: moduleKey,
      sourceItemIndex: index,
      type: "media" as const,
      contentKind: moduleKey, // 图片与视频使用对应语义组件
      payload: {
        mediaType: moduleKey,
        item,
      },
    }));
  };

/** 为未单独注册的自定义模块生成经历结构 */
const createCustomModuleFallback = (context: LayoutAdapterContext): LayoutNode[] => {
  if (!context.moduleKey.startsWith("custom_")) return [];
  return createExperienceModuleAdapter(context.moduleKey)(context);
};

// 求职意向作为独立正文块参与所有主题的测量、分页与导出。
const createJobIntentModuleAdapter: LayoutAdapter = (context) => {
  const module = context.data.jobIntent as { data?: Record<string, unknown> /* 求职字段值。 */, ui?: Record<string, any> /* 字段展示设置。 */ } | undefined;
  // 字段顺序随节点载荷参与签名，拖拽后同步更新测量与导出。
  const config = context.config as { fields?: Array<{ key: string /* 模块标识。 */; fields?: Array<{ key?: string /* 字段标识。 */ }> /* 模块字段顺序。 */ }> /* 已展开模块配置。 */ } | undefined;
  const fieldOrder = config?.fields?.find((field) => field.key === "jobIntent")?.fields?.map((field) => field.key).filter(Boolean) || [];
  const hasContent = Object.entries(module?.data || {}).some(([key, value]) =>
    module?.ui?.[key]?.hidden !== true && typeof value === "string" && value.trim(),
  );
  return hasContent ? [{
    id: "jobIntent", // 求职意向正文节点。
    sourceModuleKey: "jobIntent", // 所属模块标识。
    type: "group", // 五项资料整体排版。
    contentKind: "jobIntent", // 使用求职意向内容组件。
    splitMode: "whole", // 求职资料作为完整信息块分页。
    payload: { ...module, fieldOrder /* 当前求职字段排列顺序。 */ }, // 字段值、展示设置和顺序共同参与内容变化签名。
  }] : [];
};

/** 适配方式与实现的对应关系，不再在这里维护业务模块名单。 */
const OTHER_MODULE_ADAPTERS: Partial<Record<ResumeModulePreview, (moduleKey: string) => LayoutAdapter>> = {
  user: () => createUserModuleAdapter, // 个人信息整块适配。
  jobIntent: () => createJobIntentModuleAdapter, // 求职字段整块适配。
  slogan: () => createSloganModuleAdapter, // 顶部标语整块适配。
  list: createListModuleAdapter, // 普通条目列表适配。
  describedItem: createDescribedItemModuleAdapter, // 带描述正文的条目适配。
  media: createMediaModuleAdapter, // 不可拆分媒体条目适配。
};

/** 注册剩余内置模块和自定义模块适配器 */
export const registerOtherModuleAdapters = (registry: LayoutAdapterRegistry) => {
  // 登记决定模块使用哪种已有适配器，具体节点转换保持原实现。
  RESUME_MODULES.forEach(({ key, preview }) => {
    const createAdapter = OTHER_MODULE_ADAPTERS[preview];
    if (!createAdapter) return;
    const header = preview === "user" || preview === "slogan";
    registry.register(key, createAdapter(key), header ? {
      title: false, // 页眉内容自行展示标题。
      paragraphSpacing: false, // 页眉不插入条目段间距。
    } : undefined);
  });
  registry.registerFallback(createCustomModuleFallback);
};
