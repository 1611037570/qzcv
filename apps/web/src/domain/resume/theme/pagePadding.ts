import type { PagePaddingOverrides, ResumeUi } from "./uiTypes";

/** 旧版共用边距仅在输入处展开，独立设置的上下边距优先，零值原样保留。 */
export const normalizePagePadding = (padding?: PagePaddingOverrides): Partial<ResumeUi["page"]["padding"]> => {
  const { vertical, ...result } = padding ?? {};
  if (vertical !== undefined) {
    result.top ??= vertical;
    result.bottom ??= vertical;
  }
  return result;
};
