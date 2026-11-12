<script setup>
// 简历放大预览组件：全屏遮罩内用 ScaleContainer 缩放展示 resumePages 渲染的全部页
// 数据源由 props 传入，供模板页预览、编辑器全屏查看等场景复用
import { $t } from "@/locales";
import { useOverlayKeys } from "@/hooks/modules/useOverlayKeys";
import ResumePages from "../resumePages/index.vue";
import ScaleContainer from "../scaleContainer/index.vue";

defineOptions({ name: "FullscreenPreview" });

// 关闭时通知父组件复位控制状态
const emit = defineEmits(["close"]);

const props = defineProps({
  // 全屏是否可见，由父组件单向控制
  visible: {
    type: Boolean,
    default: false,
  },
  // 简历项：{ data, config, ui }
  item: {
    type: Object,
    required: true,
  },
  // 复用编辑器已展开的字段配置，避免全屏预览再次展开
  expandedFields: {
    type: Array,
    default: undefined,
  },
});

// ESC 关闭走弹层仲裁：弹窗或确认框盖在本层之上时，按键只作用于最上层。
// 关闭由父组件统一处理，发送 close 由父复位 visible。
useOverlayKeys({ escape: () => emit("close") }, () => props.visible);

// 点击纸张外的任意空白关闭全屏：根层被顶栏与内容区完全铺满，
// @click.self 永远无法命中自身，改为按点击目标是否落在纸张内判断。
const handleBackdropClick = (event) => {
  if (event.target.closest(".resume-page-item")) return;
  emit("close");
};
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex flex-col backdrop-blur-[10px]"
      @click="handleBackdropClick"
    >
      <!-- 顶部栏 -->
      <div class="flex h-12 shrink-0 items-center justify-between px-4">
        <span class="text-sm font-medium text-sf-text">{{ $t("resumePreview") }}</span>
        <SfTooltip :content="$t('resumeSurveyClose')">
          <button
            type="button"
            class="flex h-8 w-8 cursor-pointer! items-center justify-center rounded-full text-sf-text transition-colors hover:bg-sf-bg-2"
            @click.stop="emit('close')"
          >
            <SfIcon icon="lucide:x" size="4" />
          </button>
        </SfTooltip>
      </div>
      <!-- 缩放预览内容 -->
      <div class="min-h-0 flex-1">
        <ScaleContainer :show-toolbar="false">
          <ResumePages
            :item="item"
            :expanded-fields="expandedFields"
            mode="preview"
          />
        </ScaleContainer>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped></style>
