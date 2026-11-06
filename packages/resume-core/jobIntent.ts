// 求职意向与个人信息之间迁移的字段，不包含参加工作时间。
export const JOB_INTENT_FIELDS = ["position", "status", "arrivalTime", "city", "salary"] as const;

// 字段契约与写入校验共用归属判断，独立模块存在时个人信息不再拥有求职字段。
export function getResumeFieldOwner(moduleKey: string, field: string, moduleKeys: readonly string[]): string {
  return moduleKey === "user" && moduleKeys.includes("jobIntent") && JOB_INTENT_FIELDS.includes(field as typeof JOB_INTENT_FIELDS[number])
    ? "jobIntent" : moduleKey;
}

// 岗位等业务读取跟随实际所属模块，避免在个人信息中保留重复数据。
export function getResumeJobField(data: Record<string, any> | undefined, field: typeof JOB_INTENT_FIELDS[number]): string {
  const owner = getResumeFieldOwner("user", field, Object.keys(data || {}));
  const value = data?.[owner]?.data?.[field];
  return typeof value === "string" ? value : "";
}
