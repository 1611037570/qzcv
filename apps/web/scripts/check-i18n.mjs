import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(scriptDir, "../src");
const localeDir = path.resolve(scriptDir, "../src/locales/lang");
const baseLocale = "zh";
const targetLocales = fs
  .readdirSync(localeDir, { withFileTypes: true })
  .filter((item) => item.isDirectory() && item.name !== baseLocale)
  .map((item) => item.name);

function flattenMessage(message, prefix = "", result = {}) {
  Object.entries(message).forEach(([key, value]) => {
    const currentKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenMessage(value, currentKey, result);
      return;
    }
    result[currentKey] = value;
  });
  return result;
}

function getMessageKeys(filePath) {
  const message = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return flattenMessage(message);
}

function getPlaceholders(value) {
  return String(value).match(/\{[^}]+\}/g) || [];
}

const issues = [];
const baseDir = path.join(localeDir, baseLocale);
const baseFiles = fs.readdirSync(baseDir).filter((file) => file.endsWith(".json"));

targetLocales.forEach((locale) => {
  const localeDirPath = path.join(localeDir, locale);
  const targetFiles = fs.readdirSync(localeDirPath).filter((file) => file.endsWith(".json"));
  const files = new Set([...baseFiles, ...targetFiles]);

  files.forEach((file) => {
    const baseFile = path.join(baseDir, file);
    const targetFile = path.join(localeDirPath, file);
    if (!fs.existsSync(baseFile) || !fs.existsSync(targetFile)) {
      issues.push(`[${locale}] 缺少语言包文件: ${file}`);
      return;
    }

    const baseMessages = getMessageKeys(baseFile);
    const targetMessages = getMessageKeys(targetFile);
    Object.keys(baseMessages)
      .filter((key) => !(key in targetMessages))
      .forEach((key) => issues.push(`[${locale}/${file}] 缺少 key: ${key}`));
    Object.keys(targetMessages)
      .filter((key) => !(key in baseMessages))
      .forEach((key) => issues.push(`[${locale}/${file}] 多余 key: ${key}`));

    Object.keys(baseMessages)
      .filter((key) => key in targetMessages)
      .forEach((key) => {
        const basePlaceholders = getPlaceholders(baseMessages[key]).sort();
        const targetPlaceholders = getPlaceholders(targetMessages[key]).sort();
        if (basePlaceholders.join("|") !== targetPlaceholders.join("|")) {
          issues.push(`[${locale}/${file}] 占位符不一致: ${key}`);
        }
      });
  });
});

// 表单配置以中文为源文案，必须全部登记到映射表，避免英文界面漏翻
const localeHookFile = path.join(srcDir, "stores/modules/resume/hooks/useResumeEditorLocale.ts");
const hookText = fs.readFileSync(localeHookFile, "utf8");
const mappingStart = hookText.indexOf("const TEXT_KEYS_SOURCE = `");
const mappingSource = hookText.slice(
  mappingStart + "const TEXT_KEYS_SOURCE = `".length,
  hookText.indexOf("`;", mappingStart),
);
const textKeyMap = new Map();
for (const [, quoted, bare, key] of mappingSource.matchAll(/(?:"([^"\n]+)"|([^"\n:]+?))\s*:\s*"([^"\n]+)"/g)) {
  textKeyMap.set((quoted ?? bare).trim(), key.trim());
}

const zhResumeEditor = getMessageKeys(path.join(localeDir, baseLocale, "resume-editor.json"));
const zhResume = getMessageKeys(path.join(localeDir, baseLocale, "resume.json"));

// 映射 key 可能落在 resume-editor 或 resume 语言包中，取并集校验
const zhKnownKeys = new Set([...Object.keys(zhResumeEditor), ...Object.keys(zhResume)]);

for (const key of new Set(textKeyMap.values())) {
  if (!zhKnownKeys.has(key)) issues.push(`[zh 语言包] 映射表引用了不存在的 key: ${key}`);
}

const CJK = /[\u4e00-\u9fa5]/;
const localizedConfigFiles = [
  "stores/modules/resume/config/formConfig.ts",
  "stores/modules/resume/config/resumeOptions.ts",
];
for (const rel of localizedConfigFiles) {
  const file = path.join(srcDir, rel);
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const reported = new Set();
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text.trim();
      if (CJK.test(text) && !textKeyMap.has(text) && !reported.has(text)) {
        reported.add(text);
        issues.push(`[${rel}] 中文文案缺少国际化映射: ${text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// 主题卡片与范本内容使用动态拼接 key，按源数据逐个校验
const themeStyleDir = path.join(srcDir, "domain/resume/theme/styles");
const themeIndex = fs.readFileSync(path.join(themeStyleDir, "index.ts"), "utf8");
const themeImports = new Map();
for (const m of themeIndex.matchAll(/import\s+(\w+)\s+from\s+"@\/domain\/resume\/theme\/styles\/([\w]+)"/g)) {
  themeImports.set(m[1], m[2]);
}
const themeListBlock = themeIndex.slice(themeIndex.indexOf("createThemeTemplates(["), themeIndex.indexOf("]);"));
const themeIds = new Set();
for (const rawLine of themeListBlock.split("\n")) {
  const name = rawLine.trim().replace(/,$/, "");
  if (!name || name.includes("(") || name.startsWith("...") || name.startsWith("]")) continue;
  const file = themeImports.get(name);
  if (!file) continue;
  const id = fs.readFileSync(path.join(themeStyleDir, `${file}.ts`), "utf8").match(/^ {2}id:\s*"([^"]+)"/m)?.[1];
  if (id) themeIds.add(id);
}
const plainTitleText = fs.readFileSync(path.join(themeStyleDir, "plainTitleThemes.ts"), "utf8");
for (const m of plainTitleText.matchAll(/titleStyleId:\s*"([^"]+)"/g)) themeIds.add(m[1]);
for (const id of themeIds) {
  for (const suffix of ["name", "description"]) {
    const key = `resumeTemplateStyle_${id}_${suffix}`;
    if (!(key in zhResume)) issues.push(`[zh/resume.json] 主题卡片缺少 key: ${key}`);
  }
}

const templateListText = fs.readFileSync(path.join(srcDir, "views/resume/template/data/list.ts"), "utf8");
for (const m of templateListText.matchAll(/fileName:\s*"([^"]+)"[\s\S]{0,600}?tags:\s*\[([^\]]*)\]/g)) {
  const fileName = m[1];
  const tagCount = m[2].split(",").map((item) => item.trim()).filter(Boolean).length;
  const keys = [
    `resumeTemplateContent_${fileName}_name`,
    `resumeTemplateContent_${fileName}_description`,
    ...Array.from({ length: tagCount }, (_, index) => `resumeTemplateContent_${fileName}_tag_${index + 1}`),
  ];
  for (const key of keys) {
    if (!(key in zhResume)) issues.push(`[zh/resume.json] 范本内容缺少 key: ${key}`);
  }
}

if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log("国际化语言包检查通过");
}
