import { $t } from "@/locales";
import { computed } from "vue";
import { ALL_ROUTES } from "./routes";

// 页面信息仅由简历业务路由生成。
export const ALL_PAGE = computed(() => ALL_ROUTES.map((item) => ({
  name: $t(`core.router.${item.name}`), // 页面展示名称。
  url: `/${item.name}`, // 页面入口路径。
  desc: $t(`core.router.${item.name}Desc`), // 页面用途说明。
})));
