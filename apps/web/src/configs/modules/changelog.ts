/**
 * 编辑器更新日志数据
 * 维护方式：发版时在数组最上方新增一条，随包构建上线，无需接口与迁移
 * 对外展示的版本号取最新一条的 version 字段，随日志一起维护
 */
export interface ChangelogItem {
  id: string; // 唯一标识，用于记录用户已读状态，发新版时须更换新 id
  version: string; // 对外展示的语义化版本号，如 "v3.0"
  date: string; // 展示日期，如 "2026-11-22"
  list: string[]; // 本次变更内容，一行一条描述
}

const changelog: ChangelogItem[] = [
  {
    id: "v3-release", // V3 发布记录标识
    version: "v3.0", // 对外展示版本号
    date: "2026-11-22", // 与项目发展历程中 V3 上线日期保持一致
    list: [
      "轻舟简历 V3.0 发布：支持中英双语国际化", // 界面语言能力
      "全面适配移动端，随时随地制作与管理简历", // 移动端体验
    ],
  },
];

export default changelog;
