import { computed } from "vue";
import { ElMessage } from "element-plus";
import { $t } from "@/locales";
import { useResumeStore } from "@/stores";

// 新建、生成与另存使用同一容量口径，在消耗模型请求前拦截满额。
export const useResumeCapacity = () => {
  const store = useResumeStore();
  const remainingSlots = computed(() => store.remainingSlots);
  const ensureCapacity = () => {
    if (remainingSlots.value > 0) return true;
    ElMessage.warning($t("resumeCreateMaxLimit", { max: store.maxCount }));
    return false;
  };
  return { remainingSlots, ensureCapacity };
};
