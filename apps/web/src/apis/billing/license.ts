// 访问凭证只保存在本机浏览器：服务端不保存明文，清除浏览器数据后无法找回。
// 这里刻意不引入任何云端同步，凭证即余额。
const STORAGE_KEY = "snowflakeAiLicense";

// 读取本机凭证；隐私模式下 localStorage 可能抛错，降级为空并提示一次
export const readLicenseKey = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch (error) {
    console.warn("读取本机凭证失败，可能处于隐私模式", error);
    return "";
  }
};

// 保存凭证：只在充值成功与手动输入时调用
export const saveLicenseKey = (key: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } catch (error) {
    console.warn("保存本机凭证失败，请手动记录凭证", error);
  }
};

// 清除本机凭证：用于换用其他凭证或彻底解绑
export const clearLicenseKey = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("清除本机凭证失败", error);
  }
};

// 按 4 位分组展示，便于抄写与人工核对；前缀单独保留，避免被拆进分组
export const groupLicenseKey = (key: string) => {
  const normalized = key.replace(/-/g, "");
  if (!/^SF/i.test(normalized)) return normalized.replace(/(.{4})/g, "$1-").replace(/-$/, "");
  const body = normalized.slice(2).replace(/(.{4})/g, "$1-").replace(/-$/, "");
  return `SF-${body}`;
};
