import type { GroupFormField } from "@/components/business/dynamicForm/api";

export const USER_CUSTOM_FIELD_PREFIX = "custom_";

// 自定义字段使用统一前缀，便于从更多字段配置中恢复运行时节点
export function isUserCustomFieldKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith(USER_CUSTOM_FIELD_PREFIX);
}

// 根据持久化的字段标识和标题创建更多字段的完整运行时配置
export function createUserCustomField(key: string, label: string): GroupFormField {
  return {
    type: "group",
    id: `df-${key}`,
    component: "rowField",
    slot: "default",
    // 包裹组沿用字段标识，供字段顺序持久化与定位
    key,
    // 标签与操作区由包裹组件渲染，字段自身不再声明
    props: {
      label,
      draggable: true,
      // 自定义字段可彻底删除，删除语义由包裹组件按字段标识分发
      removable: true,
    },
    // 字段状态绑定到包裹组，供包裹组件双向绑定
    model: [
      {
        source: ["ui", key, "hidden"],
        prop: "hidden",
        defaultValue: false,
      },
      {
        source: ["ui", key, "icon"],
        prop: "icon",
        defaultValue: "other-tag",
      },
    ],
    fields: [
      {
        type: "object",
        id: `df-${key}-value`,
        key,
        // 与预设字段共用通用输入组件，保证编辑区布局一致
        component: "input",
        span: 24,
        model: {
          source: ["data", key],
          prop: "modelValue",
        },
        props: {
          placeholder: "请输入内容",
          clearable: true,
        },
      },
    ],
  };
}

// 从个人信息配置中定位更多字段容器
function getMoreField(runtimeConfig: any) {
  const userField = runtimeConfig?.fields?.find((field: any) => field?.key === "user");
  return userField?.fields?.find((field: any) => field?.key === "more");
}

// 在个人信息模块的字段容器中定位字段：字段可能位于更多分区或副标题分区
function findUserField(runtimeConfig: any, key: string) {
  const userField = runtimeConfig?.fields?.find((field: any) => field?.key === "user");
  for (const box of userField?.fields ?? []) {
    const field = box?.fields?.find((item: any) => item?.key === key);
    if (field) return { box, field };
  }
  return { box: undefined, field: undefined };
}

// 新增自定义字段时同步写入字段节点、真实值与界面属性
export function addUserCustomField(runtimeConfig: any, data: any, key: string, label: string) {
  const moreField = getMoreField(runtimeConfig);
  if (!moreField || !label) return false;

  data.user ??= {};
  data.user.data ??= {};
  if (key in data.user.data) return false;

  data.user.data[key] = "";
  // 标题与显隐、图标同属界面属性，统一放在 ui 下
  data.user.ui ??= {};
  data.user.ui[key] = { ...(data.user.ui[key] ?? {}), label };
  moreField.fields.push(createUserCustomField(key, label));
  return true;
}

// 修改标题：运行时节点立即生效，持久化位置与显隐、图标保持一致
export function renameUserCustomField(runtimeConfig: any, data: any, key: string, label: string) {
  const { field } = findUserField(runtimeConfig, key);
  if (!field || !label) return false;

  // 标题由包裹组件渲染，保存在包裹组配置上
  field.props = { ...field.props, label };
  if (data?.user) {
    data.user.ui ??= {};
    data.user.ui[key] = { ...(data.user.ui[key] ?? {}), label };
  }
  return true;
}

// 删除自定义字段时同时清理字段节点、值与界面配置
export function removeUserCustomField(runtimeConfig: any, data: any, key: string) {
  const { box, field } = findUserField(runtimeConfig, key);
  if (!box || !field) return false;

  box.fields.splice(box.fields.indexOf(field), 1);
  delete data?.user?.data?.[key];
  delete data?.user?.ui?.[key];
  return true;
}

/**
 * 历史数据迁移：自定义字段标题曾写在 config.modules 的结构里，现统一到 data.user.ui[key].label。
 * 只在读取简历时执行，写入新位置后即清理旧字段，重复执行不会产生副作用。
 *
 * 临时兼容：2026-12-12 之后（存量简历都至少被打开过一次）可删除本函数，
 * 以及 resumeStorage 读取入口与 resumeLifecycle 新建入口里的两处调用。
 */
export function migrateCustomFieldLabels(item: any) {
  const modules = item?.config?.modules;
  if (!Array.isArray(modules)) return item;

  const walk = (fields: any[]) => {
    fields?.forEach((field: any) => {
      if (isUserCustomFieldKey(field?.key) && typeof field.label === "string") {
        item.data ??= {};
        item.data.user ??= {};
        item.data.user.ui ??= {};
        item.data.user.ui[field.key] ??= {};
        // 新位置已有标题时以新位置为准，只补缺失项
        if (!item.data.user.ui[field.key].label) item.data.user.ui[field.key].label = field.label;
        // 旧位置清理掉，结构只保留 key
        delete field.label;
      }
      if (Array.isArray(field?.fields)) walk(field.fields);
    });
  };

  walk(modules);
  return item;
}
