import { JOB_INTENT_FIELDS } from "@snowflake/resume-core";
import { isEmptyFieldValue } from "./useUserSubtitle";

// 添加求职意向时真正移动字段和展示设置，个人信息不保留副本。
export function moveToJobIntent(item: any) {
  const user = item.data.user;
  const intent = item.data.jobIntent ||= { data: {} /* 求职意向字段值。 */, ui: {} /* 字段与模块展示设置。 */ };
  intent.data ||= {};
  intent.ui ||= {};
  for (const key of JOB_INTENT_FIELDS) {
    // 已有字段即使被清空也保留其最新值，不再用个人信息旧值补回。
    if (!Object.prototype.hasOwnProperty.call(intent.data, key)) {
      intent.data[key] = !isEmptyFieldValue(user?.data?.[key]) ? user.data[key] : "";
    }
    if (!intent.ui[key] && user?.ui?.[key]) intent.ui[key] = user.ui[key];
    if (user?.data) delete user.data[key];
    if (user?.ui) delete user.ui[key];
  }
  // 回迁后字段追加在个人信息末尾，不恢复原先的副标题位置。
  if (Array.isArray(user?.ui?.subtitleOrder)) {
    user.ui.subtitleOrder = user.ui.subtitleOrder.filter((key: string) => !JOB_INTENT_FIELDS.includes(key as typeof JOB_INTENT_FIELDS[number]));
  }
}

// 删除求职意向前将最新内容和字段设置移回个人信息。
export function moveFromJobIntent(item: any, fields: any[]) {
  const intent = item.data.jobIntent;
  const user = item.data.user ||= { data: {} /* 个人信息字段值。 */, ui: {} /* 个人字段展示设置。 */ };
  user.data ||= {};
  user.ui ||= {};
  const restored: string[] = [];
  for (const key of JOB_INTENT_FIELDS) {
    // 先移除个人信息中可能残留的旧值和设置，回迁只认模块最新内容。
    delete user.data[key];
    delete user.ui[key];
    if (!isEmptyFieldValue(intent?.data?.[key])) {
      user.data[key] = intent.data[key];
      restored.push(key);
      if (intent?.ui?.[key]) user.ui[key] = intent.ui[key];
    }
  }
  // 回迁不恢复置顶标记，避免字段又被分配到姓名下方。
  if (Array.isArray(user.ui.subtitleOrder)) {
    user.ui.subtitleOrder = user.ui.subtitleOrder.filter((key: string) => !JOB_INTENT_FIELDS.includes(key as typeof JOB_INTENT_FIELDS[number]));
  }
  // 持久化顺序中先移除旧位置，再把回迁字段放到更多字段末尾。
  const personal = fields.find((field: any) => field.key === "user");
  for (const group of personal?.fields || []) {
    if (Array.isArray(group.fields)) group.fields = group.fields.filter((field: any) => !JOB_INTENT_FIELDS.includes(field.key));
  }
  const more = personal?.fields?.find((field: any) => field.key === "more");
  if (more) more.fields = [...(more.fields || []), ...restored.map((key) => ({ key /* 回迁的字段标识。 */ }))];
}
