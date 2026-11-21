<script setup>
import { useImageUpload } from "@/hooks";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useResumeStore } from "@/stores";
import { DEFAULT_SCHOOL_LOGO_APPEARANCE, SCHOOL_LOGO_PRESET_WIDTHS } from "@/domain/resume/theme/schoolLogo";
import ImageCropModal from "./imageCropModal.vue";

// 校徽独立保存，仅在确认裁切后写回图片。
const image = defineModel("modelValue", {
  type: String, // 校徽图片地址。
  default: "", // 未上传时不显示校徽。
});
const cropRatio = ref("1:1");
const resumeStore = useResumeStore();
const cropAspectRatio = computed(() => cropRatio.value === "3:1" ? 3 : 1);
const { openPicker, loading, cropVisible, cropSrc, confirmCrop, closeCrop } = useImageUpload({
  crop: true, // 上传后使用与头像相同的裁切流程。
  quality: 1, // 保留校徽细节。
  onResult: (dataUrl) => { image.value = dataUrl; }, // 写回校徽图片。
});
// 再次上传时默认选中此前确认的裁切比例，取消裁切不改写配置。
watch(cropVisible, (visible) => {
  if (visible) cropRatio.value = resumeStore.currentUI?.user?.logo?.ratio ?? DEFAULT_SCHOOL_LOGO_APPEARANCE.ratio;
});
// 按所选比例输出，校徽设置不修改头像的比例或外观。
const handleConfirmCrop = async (cropper) => {
  if (!cropper) return;
  const ratio = cropRatio.value;
  try {
    await confirmCrop(cropper, {
      width: 800, // 校徽裁切输出宽度。
      height: Math.round(800 / (ratio === "3:1" ? 3 : 1)), // 按本次确认的裁切比例计算输出高度。
    });
    if (resumeStore.currentUI) {
      resumeStore.currentUI.user.logo = {
        ...DEFAULT_SCHOOL_LOGO_APPEARANCE,
        ...resumeStore.currentUI.user.logo,
        width: SCHOOL_LOGO_PRESET_WIDTHS[ratio], // 确认上传时按正方形或横版应用对应默认尺寸。
        ratio, // 保存本次确认的裁切比例，展示时保持一致。
      };
    }
  } catch (error) {
    console.error("校徽裁切压缩失败:", error);
  }
};

// 预览框与头像一致为正方形，图片按已保存的裁切比例在框内居中
const PREVIEW_SIZE = 70;
const innerStyle = computed(() => {
  const ratio = resumeStore.currentUI?.user?.logo?.ratio ?? DEFAULT_SCHOOL_LOGO_APPEARANCE.ratio;
  return ratio === "3:1"
    ? { width: `${PREVIEW_SIZE}px`, height: `${Math.round(PREVIEW_SIZE / 3)}px` }
    : { width: `${PREVIEW_SIZE}px`, height: `${PREVIEW_SIZE}px` };
});

// 图片查看器显隐
const previewVisible = ref(false);

// 导出当前校徽，并根据图片格式设置文件扩展名。
const exportLogo = () => {
  const format = image.value.match(/^data:image\/([a-zA-Z0-9.+-]+)/)?.[1]?.toLowerCase();
  const extension = format === "jpeg" ? "jpg" : format === "svg+xml" ? "svg" : format || "webp";
  const link = document.createElement("a");
  link.href = image.value;
  link.download = `${$t("schoolLogo")}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
};
onBeforeUnmount(closeCrop);
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <!-- 正方形预览框：横版校徽按 3:1 居中显示，不再被方形框压成一条 -->
    <button
      type="button"
      class="group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-sf-b bg-sf-bg text-sf-text-3 transition-colors hover:border-sf-theme hover:text-sf-theme disabled:cursor-wait"
      :style="{ width: `${PREVIEW_SIZE}px`, height: `${PREVIEW_SIZE}px` }"
      :disabled="loading"
      :aria-label="$t('uploadSchoolLogo')"
      @click="openPicker"
    >
      <img v-if="image" :src="image" :style="innerStyle" class="rounded-lg object-contain" :alt="$t('schoolLogo')" />
      <div v-else class="flex flex-col items-center gap-1">
        <SfIcon icon="mdi:image-plus" size="5" />
        <span class="text-xs">{{ loading ? $t("processing") : $t("uploadSchoolLogo") }}</span>
      </div>
    </button>

    <!-- 操作统一收进图标行，未上传时保留空行以维持与头像卡片等高 -->
    <div class="flex h-7 items-center gap-1">
      <SfTooltip v-if="image" :content="$t('reselectImage')">
        <button
          type="button"
          class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-sf-text-2 transition-colors hover:bg-sf-bg hover:text-sf-theme disabled:cursor-wait"
          :disabled="loading"
          @click="openPicker"
        >
          <SfIcon icon="ic:round-file-upload" size="4" />
        </button>
      </SfTooltip>
      <SfTooltip v-if="image" :content="$t('viewImage')">
        <button
          type="button"
          class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-sf-text-2 transition-colors hover:bg-sf-bg hover:text-sf-theme"
          @click="previewVisible = true"
        >
          <SfIcon icon="ic:round-zoom-in" size="4" />
        </button>
      </SfTooltip>
      <SfTooltip v-if="image" :content="$t('exportAvatar')">
        <button
          type="button"
          class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-sf-text-2 transition-colors hover:bg-sf-bg hover:text-sf-theme"
          @click="exportLogo"
        >
          <SfIcon icon="material-symbols:download" size="4" />
        </button>
      </SfTooltip>
    </div>
  </div>
  <el-image-viewer v-if="previewVisible" :url-list="[image]" @close="previewVisible = false" />
  <ImageCropModal
    :model-value="cropVisible"
    :src="cropSrc"
    :aspect-ratio="cropAspectRatio"
    @update:model-value="closeCrop"
    @confirm="handleConfirmCrop"
  >
    <div class="mt-3 grid grid-cols-2 gap-3">
      <SfButton size="small" border :type="cropRatio === '1:1' ? 'theme' : 'bg'" @click="cropRatio = '1:1'">
        {{ $t("schoolLogoSquareRatio") }}
      </SfButton>
      <SfButton size="small" border :type="cropRatio === '3:1' ? 'theme' : 'bg'" @click="cropRatio = '3:1'">
        {{ $t("schoolLogoWideRatio") }}
      </SfButton>
    </div>
  </ImageCropModal>
</template>
