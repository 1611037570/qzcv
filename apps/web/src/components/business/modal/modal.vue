<template>
  <Teleport to="body">
    <!-- 背景模糊层 -->
    <SfMask :show="!!modeValue" :index="80" />

    <!-- 弹窗外壳 -->
    <Transition name="fade" :disabled="performanceMode" appear>
      <div
        v-if="modeValue"
        class="fixed top-0 right-0 bottom-0 left-0 z-80 flex items-center justify-center"
      >
        <!-- 弹窗容器 -->
        <div
          class="flex flex-col border border-sf-b p-3"
          :class="[bgClass, full ? 'h-screen w-screen rounded-none' : 'max-h-[90vh] max-w-[90vw] rounded-3xl']"
          :style="widthStyle"
        >
          <!-- 标题和关闭按钮 -->
          <div
            class="flex-c relative mb-3 min-w-full text-xl font-bold"
            v-if="title"
            :class="titleClass"
          >
            {{ title }}
            <div class="absolute top-1/2 -right-1 z-2 h-9 w-9 -translate-y-1/2">
              <SfIcon
                @click="requestClose"
                icon="carbon:close-outline"
                size="6"
                boxSize="9"
                class="rounded-2xl transition-all duration-300 group-hover:text-sf-theme hover:bg-sf-theme"
              />
            </div>
          </div>
          <!-- 内容区域 -->
          <div class="flex-1 overflow-hidden">
            <slot v-if="modeValue"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { useSystemStore } from "@/stores/modules/system";
import { useScrollLock } from "@vueuse/core";
import { useOverlayKeys } from "@/hooks/modules/useOverlayKeys";
import { storeToRefs } from "pinia";
import { computed, onUnmounted, watch } from "vue";

defineOptions({ name: "SfModal" });

// ==================== Props 定义 ====================
const props = defineProps({
  /** 弹窗标题 */
  title: { type: String, default: "" },
  /** 弹窗标题自定义类名 */
  titleClass: { type: String, default: "" },
  /** 弹窗主体背景类名，允许调用方调整底色，默认沿用主要背景。 */
  bgClass: { type: String, default: "bg-sf-primary" },
  /** 弹窗宽度 */
  width: { type: String, default: "" },
  /** 是否全屏显示（默认 false） */
  full: { type: Boolean, default: false },
  /** 关闭前的守卫，返回 false 可阻止关闭，支持异步返回 Promise */
  beforeClose: { type: Function, default: undefined },
});

// ==================== 全局状态 ====================
const systemStore = useSystemStore();
/** 性能模式开启时禁用弹窗过渡动画 */
const { performanceMode } = storeToRefs(systemStore);

// ==================== 弹窗显隐控制 ====================
/** 双向绑定弹窗显隐状态 */
const modeValue = defineModel();
/** 锁定背景滚动 */
const isLocked = useScrollLock(document.body);

// 统一的关闭入口：右上角关闭按钮与 ESC 都先过守卫，未传守卫时直接关闭
// 守卫执行期间忽略重复触发，避免连点关闭按钮弹出多个确认框
let closing = false;
const requestClose = async () => {
  if (closing) return;
  closing = true;
  try {
    if (props.beforeClose) {
      const allowed = await props.beforeClose();
      if (allowed === false) return;
    }
    modeValue.value = false;
  } finally {
    closing = false;
  }
};

// ==================== 键盘事件 ====================
// ESC 关闭交给弹层仲裁：叠加确认框时只关闭最上层，本弹窗保持打开。
useOverlayKeys({ escape: requestClose }, () => modeValue.value);

/** 弹窗显隐同步背景滚动锁定 */
watch(
  modeValue,
  (val) => {
    isLocked.value = val;
  },
  { immediate: true },
);

/** 组件卸载时解除滚动锁定，按键监听由弹层仲裁自行回收 */
onUnmounted(() => {
  isLocked.value = false;
});

// ---------- 弹窗宽度样式 ----------
/** 按 width 属性设置弹窗宽度，未传时不生效 */
const widthStyle = computed(() => (props.width ? { width: props.width } : {}));
</script>

<style>
/* ========== 弹窗淡入淡出动画 ========== */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(0.3);
}
</style>
