/**
 * 大数字缩写：一万以上换算成 w，一千以上换算成 k，并去掉整数的末尾 .0
 * 例如 128400 显示 12.8w，8600 显示 8.6k，999 保持 999
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  // 统一去掉一位小数里多余的 .0
  const trimZero = (text: string) => text.replace(/\.0$/, "");
  if (value >= 10000) return `${trimZero((value / 10000).toFixed(1))}w`;
  if (value >= 1000) return `${trimZero((value / 1000).toFixed(1))}k`;
  return String(Math.round(value));
}
