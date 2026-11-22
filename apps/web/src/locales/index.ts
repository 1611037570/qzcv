import { config } from "@/configs";
import type { I18n, I18nOptions } from "vue-i18n";
import { createI18n } from "vue-i18n"; // 从 vue-i18n 导入创建实例的方法

import coreEn from "./lang/en/core.json";
import coreZh from "./lang/zh/core.json";
import resumeEn from "./lang/en/resume.json";
import resumeZh from "./lang/zh/resume.json";
import resumeEditorEn from "./lang/en/resume-editor.json";
import resumeEditorZh from "./lang/zh/resume-editor.json";
import type { LangItem, Translation } from "./types";

export const LANG_LIST: LangItem[] = [
  { key: "zh", name: "简体中文", value: "zh" },
  { key: "en", name: "English", value: "en" },
  // 别名标识项：不带 name（仅用于映射到同一核心语言）
  { key: "zh", value: "zh-CN" },
  { key: "zh", value: "zh-TW" },
  { key: "en", value: "en-US" },
];
function getLangKey(lang: string): string {
  // 直接查找value匹配的项，拿到对应的核心key
  const matchItem = LANG_LIST.find((item) => item.value === lang);
  return matchItem?.key || "";
}
// 获取默认语言
const getDefaultLocale = () => {
  // 优先读本地存储
  const savedLangKey = getLangKey(localStorage.getItem("snowflakeLanguage") || "");
  if (savedLangKey) {
    return savedLangKey;
  }

  // 读浏览器语言
  const browserLangKey = getLangKey(navigator.language || "");
  if (browserLangKey) {
    return browserLangKey;
  }

  // 兜底返回默认语言
  const defaultLang = config.app.defaultLanguage;
  return getLangKey(defaultLang);
};

const DEFAULT_LANG_KEY = getDefaultLocale();
// 核心包与简历渲染相关的语言包静态打包：任意页面都可能渲染简历预览，
// 模块标题、字段名与主题文案来自 resume-editor，必须随核心包一起内置。
// 其余页面语言包（如面试、工具）由路由守卫触发 loadPageLang 按需请求，载入后才放行路由。
const BUNDLED_LANG: Record<string, Record<string, LocaleMessage>> = {
  zh: { core: coreZh.core, resume: resumeZh, "resume-editor": resumeEditorZh },
  en: { core: coreEn.core, resume: resumeEn, "resume-editor": resumeEditorEn },
};
// 构建语言包映射：core 保持嵌套命名空间，其余语言包按扁平键合并后随实例内置
const messages: any = {};
Object.keys(BUNDLED_LANG).forEach((langKey) => {
  const { core, ...packs } = BUNDLED_LANG[langKey];
  messages[langKey] = { core: core || {}, ...Object.assign({}, ...Object.values(packs)) };
});

/**
 * i18n 配置选项
 */
const i18nOptions: I18nOptions = {
  legacy: false, // 启用组合式 API 模式
  globalInjection: true, // 全局注入 $t 函数
  locale: DEFAULT_LANG_KEY, // 设置默认语言
  fallbackLocale: "zh", // 英文缺失字段回退到中文
  messages, // 语言包映射
  missingWarn: false, // 关闭缺失键警告
  fallbackWarn: false, // 关闭后备键警告
};
const i18n: I18n = createI18n(i18nOptions);

interface LocaleRoute {
  path?: unknown;
  meta?: Record<string, any>;
}

// 由路由路径推导语言文件名：1 级取路径段，多级用 "-" 连接
export function getPageLocaleFile(route: LocaleRoute): string {
  const path = typeof route.path === "string" ? route.path : "";
  return path.split("/").filter(Boolean).join("-");
}

// 页面语言包由当前页面及路由声明的公共语言包共同组成
function getPageLocaleFiles(route: LocaleRoute): string[] {
  if (Array.isArray(route.meta?.localeFiles)) {
    return [...new Set(route.meta.localeFiles.filter(Boolean))];
  }
  return [getPageLocaleFile(route)];
}

type LocaleMessage = Record<string, any>;

const localeMessageCache = new Map<string, LocaleMessage | null>();
const localeMessageLoading = new Map<string, Promise<LocaleMessage | null>>();

async function dynamicLoadPageLang(name: string, langKey: string): Promise<LocaleMessage | null> {
  const cacheKey = `${langKey}/${name}`;
  if (localeMessageCache.has(cacheKey)) {
    return localeMessageCache.get(cacheKey) || null;
  }
  const loadingMessage = localeMessageLoading.get(cacheKey);
  if (loadingMessage) {
    return loadingMessage;
  }

  const loading = import(`./lang/${langKey}/${name}.json`)
    .then((pageLangModule) => {
      const pageLang = pageLangModule.default as LocaleMessage;
      localeMessageCache.set(cacheKey, pageLang);
      return pageLang;
    })
    .catch((error) => {
      localeMessageCache.set(cacheKey, null);
      if (config.app.dev) {
        console.warn(`[i18n] 加载语言包失败: ${langKey}/${name}.json`, error);
      }
      return null;
    })
    .finally(() => {
      localeMessageLoading.delete(cacheKey);
    });

  localeMessageLoading.set(cacheKey, loading);
  return loading;
}

export const loadPageLang = async (route: LocaleRoute, langKey?: string) => {
  langKey = (langKey || String((i18n.global.locale as any).value ?? i18n.global.locale)) as string;
  const bundledMessage = BUNDLED_LANG[langKey] || {};
  const pageFiles = getPageLocaleFiles(route);
  const pageMessages = await Promise.all(
    pageFiles.map(async (name) =>
      name in bundledMessage
        ? bundledMessage[name]
        : (await dynamicLoadPageLang(name, langKey)) || {},
    ),
  );
  const pageMessage = Object.assign({}, ...pageMessages);
  // 内置的简历相关语言包始终保留，页面语言包在其后覆盖补充
  const { core: bundledCore, ...bundledPacks } = bundledMessage;
  i18n.global.setLocaleMessage(langKey, {
    core: bundledCore || {},
    ...Object.assign({}, ...Object.values(bundledPacks)),
    ...pageMessage,
  });
  // 语言包准备完成后再切换语言，避免业务层先读取到未加载的页面文案
  (i18n.global.locale as any).value = langKey;
  localStorage.setItem("snowflakeLanguage", langKey);
};

// 导出翻译函数
export const $t = i18n.global.t as Translation;

// 导出 i18n 实例
export default i18n;
