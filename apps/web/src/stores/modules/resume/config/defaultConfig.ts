import { getUUID } from "@/utils";
import { defaultThemeTemplate } from "@/domain/resume/theme/uiConfig";
import { RESUME_MODULES } from "./moduleRegistry";

// 保留现有消费入口，名称与图标统一从模块登记派生。
export const DEFAULT_MODULE_NAMES = RESUME_MODULES.filter((module) => module.key !== "custom").map(
  ({ key, name, icon }) => ({ key, name, icon }),
);
// “整个简历”占位项：无具体模块选中时作为默认操作对象
export const ALL_MODULE_KEY = "all";
export const ALL_MODULE_NAME = "整个简历";
export const ALL_MODULE_ICON = "lucide:file-text";
export const ALL_MODULE = {
  key: ALL_MODULE_KEY,
  name: ALL_MODULE_NAME,
  icon: ALL_MODULE_ICON,
};
// 自定义模块图标：名称由用户输入动态生成，仅图标在此统一维护
export const CUSTOM_MODULE_ICON = RESUME_MODULES.find((module) => module.key === "custom")!.icon;
// 默认简历项
export const DEFAULT_RESUME_ITEM = {
  // 简历ID
  id: getUUID().slice(0, 6),
  // 简历数据
  data: structuredClone({}),
  // 简历结构：只存模块和可排序字段顺序，运行时由全局表单定义展开
  config: {
    modules: [{ key: "user" }],
  },
  // UI配置
  ui: {
    theme: { // 初始主题选择，默认参数在运行时展开
      template: defaultThemeTemplate, // 初始主题编号
    },
  },
  // 使用信息
  usage: {
    tags: [] as string[], // 简历分类标签，不进入投递正文。
    // 标题模式：自动生成或自定义
    titleMode: "auto" as const,
    // 自定义标题内容
    customTitle: "",
    // 最后使用时间
    lastUseTime: Date.now(),
    // 创建时间
    createTime: Date.now(),
  },
};
// 默认系统配置
export const DEFAULT_SYSTEM = {
  // 新增记录默认展开：开启时新添加的记录默认展开，关闭默认收起
  defaultItemExpanded: true,
  // 左侧栏更多操作默认展开，侧栏切换后持久保存当前状态
  moreOperationsExpanded: true,
  // 打印模式：开启后预览去色，模拟黑白打印效果
  printMode: false,
  // 点击预览定位：开启后点击预览区模块会定位到左侧编辑区对应模块
  previewClickLocate: true,
  // 是否展示调试控制台
  showDebug: false,
  // 是否启用浏览器建议提示
  showBrowserTip: true,
};
// 默认编辑器配置
export const DEFAULT_EDITOR = {
  // 编辑器区域宽度(px)：模块树改为加宽列表后需要更多横向空间
  editorWidth: 620,
};
