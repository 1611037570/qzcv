/** 模块只选择已有适配方式，节点转换与分页逻辑仍由预览层负责。 */
export type ResumeModulePreview =
  | "user" | "jobIntent" | "slogan" | "list" | "experience"
  | "richText" | "skill" | "academic" | "describedItem" | "media" | "custom";

export interface ResumeModuleDefinition {
  /** 稳定模块标识，同时关联同名表单、数据和模块帮助文案。 */
  key: string;
  /** 编辑器默认名称。 */
  name: string;
  /** 导航与帮助入口共用的图标。 */
  icon: string;
  /** 预览层使用的适配方式。 */
  preview: ResumeModulePreview;
  /** 是否允许通过预设入口添加，未声明时允许。 */
  addable?: boolean;
  /** 常用模块与一键添加的排列位置，未声明时归入其他模块。 */
  basicOrder?: number;
}

// 模块元信息只在此登记，表单、添加入口、预览和帮助按稳定标识关联。
const MODULE_DEFINITIONS = [
  { key: "user", name: "个人信息", icon: "mdi:account", preview: "user", addable: false },
  { key: "jobIntent", name: "求职意向", icon: "lucide:briefcase", preview: "jobIntent" },
  { key: "slogan", name: "顶部标语", icon: "lucide:type", preview: "slogan", addable: false },
  { key: "account", name: "社交账号", icon: "mdi:account-box-outline", preview: "list" },
  { key: "education", name: "教育经历", icon: "mdi:school-outline", preview: "experience", basicOrder: 1 },
  { key: "skill", name: "专业技能", icon: "mdi:hammer-wrench", preview: "skill", basicOrder: 0 },
  { key: "advantage", name: "个人优势", icon: "fa6-solid:seedling", preview: "richText" },
  { key: "work", name: "工作经历", icon: "lucide:briefcase", preview: "experience", basicOrder: 3 },
  { key: "internship", name: "实习经历", icon: "lucide:briefcase", preview: "experience" },
  { key: "project", name: "项目经历", icon: "mdi:code-tags", preview: "experience", basicOrder: 2 },
  { key: "club", name: "社团经历", icon: "mdi:account-group-outline", preview: "experience" },
  { key: "volunteer", name: "志愿服务经历", icon: "mdi:hand-heart-outline", preview: "experience" },
  { key: "publication", name: "论文发表", icon: "mdi:file-document-multiple-outline", preview: "academic" },
  { key: "honor", name: "荣誉证书", icon: "fa6-solid:award", preview: "describedItem" },
  { key: "portfolio", name: "作品集", icon: "mdi:widgets", preview: "media" },
  { key: "custom", name: "自定义模块", icon: "mdi:puzzle-outline", preview: "custom", addable: false },
] as const satisfies readonly ResumeModuleDefinition[];

/** 已登记的表单标识，新增模块时要求补齐对应表单。 */
export type ResumeModuleKey = typeof MODULE_DEFINITIONS[number]["key"];

/** 对外统一使用模块定义，避免消费方维护重复名单。 */
export const RESUME_MODULES: readonly ResumeModuleDefinition[] = MODULE_DEFINITIONS;
