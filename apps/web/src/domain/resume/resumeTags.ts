// 标签统一去除空白、空值和重复项，兼容旧简历未保存标签的情况。
export const normalizeResumeTags = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? [...new Set(tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))]
    : [];
