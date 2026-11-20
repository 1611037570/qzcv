import { loadPageLang } from "@/locales";
import { startRouteLoading } from "@/utils/modules/routeLoading";
import { useSystemStore } from "@/stores/modules/system";

/**
 * 路由前置守卫
 * @param to 目标路由对象
 * @param from 来源路由对象
 * @param next 路由放行函数
 */
export async function beforeEachGuard(to: any, from: any, next: any) {
  startRouteLoading();
  // 页面语言包加载完成后再放行，保证页面业务配置首次渲染即可读取当前语言
  await loadPageLang(to);

  // 每次切换路由时后台检测版本更新，不等待结果避免阻塞跳转
  // 发现新版本直接刷新，避免继续使用旧缓存资源
  const systemStore = useSystemStore();
  systemStore.checkVersionUpdate();

  // 放行路由
  next();
}
