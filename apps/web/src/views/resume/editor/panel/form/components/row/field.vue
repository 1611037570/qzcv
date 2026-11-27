<script setup lang="ts">
import Icon from "../icon.vue";
import { useFormContext } from "@/components/business/dynamicForm/api";
import { useResumeStore } from "@/stores";
import {
  isUserCustomFieldKey,
  removeUserCustomField,
  renameUserCustomField,
} from "@/stores/modules/resume/hooks/useUserCustomField";
import {
  getUserSubtitleKeys,
  hasUserFieldContent,
  isUserSubtitleCapable,
  markUserSubtitle,
  unmarkUserSubtitle,
  MAX_USER_SUBTITLE,
} from "@/stores/modules/resume/hooks/useUserSubtitle";
import { storeToRefs } from "pinia";
import i18n, { $t } from "@/locales";
import { getLocalizedIconCategories } from "../../../../data/iconCategories";
// 包裹组的模型绑定只用于状态透传，不落成根元素属性
defineOptions({ inheritAttrs: false });
// 字段包裹组件：定制水平布局的标签与操作区，字段内容通过插槽嵌套
const {
  label,
  tip,
  removable = false,
  draggable = false,
  displayOptions,
} = defineProps<{
  label?: string;
  tip?: string;
  removable?: boolean;
  draggable?: boolean;
  // 展示形态选项：声明后渲染分段切换
  displayOptions?: { label: string; value: string }[];
}>();
const { currentForm, hasFieldData, removeField } = useFormContext();
// 隐藏开关：绑定被包裹字段的隐藏路径，未声明绑定时不渲染开关
const hidden = defineModel<boolean | undefined>("hidden");
// 字段图标：绑定被包裹字段的图标路径，未声明绑定时不渲染图标选择
const icon = defineModel<string | undefined>("icon");
// 展示形态：绑定被包裹字段的展示路径，未声明绑定时不渲染分段切换
const display = defineModel<string | undefined>("display");
// 分段切换项：字段标签对应配置声明的展示形态
const displayList = computed(() =>
  (displayOptions ?? []).map((option) => ({ name: option.label, value: option.value })),
);
// 被包裹的字段：数据绑定与渲染条件以字段自身配置为准
const field = computed(() => currentForm.value?.fields?.[0]);
// 字段标识：包裹组与内层字段共用同一标识
const fieldKey = computed(() => field.value?.key);
// 自定义字段：与预设字段共用包裹与操作，仅重命名与删除语义不同
const isCustomField = computed(() => isUserCustomFieldKey(fieldKey.value));
// 可添加字段：数据存在才渲染，与编辑器的添加逻辑保持一致
const renderable = computed(() => !field.value?.addable || hasFieldData(field.value));
// 简历运行时配置与数据：副标题标记、自定义字段的重命名与删除都落在配置与数据上
const resumeStore = useResumeStore();
const { runtimeConfig, currentData } = storeToRefs(resumeStore);
// 字段是否已填写：用于图标右下角展示填写状态
const filled = computed(() => hasUserFieldContent(currentData.value, fieldKey.value));
// 必填字段：未填写时角标提示待补充
const requiredField = computed(() => field.value?.required === true);
const localizedIconCategories = computed(() => {
  (i18n.global.locale as any).value;
  return getLocalizedIconCategories();
});
// 当前字段是否已置顶：以顺序数组为唯一判据
const isSubtitle = computed(() =>
  getUserSubtitleKeys(currentData.value?.user?.ui).includes(fieldKey.value ?? ""),
);
// 字段属于「更多」体系时支持置顶到姓名下方
const subtitleCapable = computed(() => isUserSubtitleCapable(runtimeConfig.value, fieldKey.value));
// 已标记的副标题数量：上限按标记个数判断，与序号是否连续无关
const subtitleCount = computed(() => getUserSubtitleKeys(currentData.value?.user?.ui).length);
// 副标题已达上限且当前字段未标记
const subtitleFull = computed(() => !isSubtitle.value && subtitleCount.value >= MAX_USER_SUBTITLE);
// 副标题按钮提示：区分取消、已达上限、内容为空与可标记
const subtitleTip = computed(() => {
  if (isSubtitle.value) return $t("cancelSubtitle");
  if (subtitleFull.value) return $t("subtitleLimit", { count: MAX_USER_SUBTITLE });
  if (!hasUserFieldContent(currentData.value, fieldKey.value)) return $t("fillBeforePin");
  return $t("markSubtitle");
});
// 重命名弹窗与临时标题
const showRenameModal = ref(false);
const fieldLabel = ref("");
// 打开重命名弹窗：以当前标题回填
const openRenameModal = () => {
  fieldLabel.value = label || "";
  showRenameModal.value = true;
};
// 保存标题：仅自定义字段的标题会被持久化
const handleRename = () => {
  const value = fieldLabel.value.trim();
  if (!value || !runtimeConfig.value || !fieldKey.value) return;
  renameUserCustomField(runtimeConfig.value, currentData.value, fieldKey.value, value);
  showRenameModal.value = false;
};
// 切换隐藏状态：写回字段的隐藏路径
const toggleHidden = () => (hidden.value = !hidden.value);
// 更新图标：写回字段的图标路径
const updateIcon = (value: string) => (icon.value = value);
// 切换副标题：标记后字段移入副标题分区，取消后回到更多分区末尾
const toggleSubtitle = () => {
  if (!runtimeConfig.value || !currentData.value || !fieldKey.value) return;
  if (isSubtitle.value) {
    unmarkUserSubtitle(runtimeConfig.value, currentData.value, fieldKey.value);
    return;
  }
  if (subtitleFull.value) return;
  markUserSubtitle(runtimeConfig.value, currentData.value, fieldKey.value);
};
// 删除：自定义字段彻底移除，预设字段只清空数据以便重新添加
const clearField = () => {
  if (!runtimeConfig.value || !currentData.value || !fieldKey.value) return;
  // 先取消副标题标记，字段回到更多分区后再按各自语义移除
  if (isSubtitle.value) {
    unmarkUserSubtitle(runtimeConfig.value, currentData.value, fieldKey.value);
  }
  if (!isCustomField.value) {
    removeField(field.value);
    return;
  }
  removeUserCustomField(runtimeConfig.value, currentData.value, fieldKey.value);
};
</script>

<template>
  <div v-if="renderable" class="flex w-full items-center gap-1.5">
    <!-- 左侧固定列：字段图标独立展示，不参与右侧文案与输入的上下排列 -->
    <div v-if="label" class="flex shrink-0 items-center" @click.stop="">
      <!-- 字段图标底板：有图标绑定时点击图标可切换，右下角展示填写状态 -->
      <span
        class="field-icon-tile relative flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-sf-theme-3 text-sf-theme"
      >
        <SfIconPicker
          v-if="icon !== undefined"
          :categories="localizedIconCategories"
          :all-category-name="$t('allIcons')"
          :modelValue="icon"
          @update:modelValue="updateIcon"
          :size="5"
          class="field-icon-picker"
        />
        <!-- 无图标绑定的固定字段使用个人图标，保持与可换图标字段同款底板 -->
        <SfIcon v-else icon="mdi:account" size="5" />
        <!-- 填写状态角标：外圈由图标盒子承载，尺寸与模块树角标一致 -->
        <SfIcon
          v-if="filled || requiredField"
          :icon="filled ? 'lucide:check' : 'lucide:circle-alert'"
          size="3.5"
          box-size="3"
          class="absolute! -right-0.5 -bottom-0.5 rounded-full ring-1 ring-sf-primary"
          :class="filled ? 'bg-sf-success text-sf-theme-text' : 'bg-sf-warning text-sf-theme-text'"
          aria-hidden="true"
        />
      </span>
    </div>
    <!-- 右侧：名称在上、输入在下，操作区固定在名称行尾 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex w-full items-center">
        <span v-if="label" class="truncate pr-1 text-sm text-sf-text" @click.stop="">
          {{ label }}
        </span>
        <sf-tooltip :content="tip" v-if="tip" class="text-sf-text" />
        <!-- 行尾操作：拖拽把手排在最前，后接重命名、置顶、隐藏与删除 -->
        <div
          v-if="draggable || hidden !== undefined || removable || subtitleCapable"
          class="ml-auto flex shrink-0 items-center"
        >
          <!-- 拖拽把手：位于右侧操作区的第一个位置，无拖拽字段不渲染 -->
          <Icon v-if="draggable" icon="icon-park-outline:drag" class="item-drag cursor-move!" />
          <!-- 重命名仅对自定义字段开放：预设字段标题来自模板配置，不会持久化 -->
          <Icon
            v-if="isCustomField"
            @pointerdown.stop.prevent
            @click="openRenameModal"
            icon="lucide:pencil"
          />
          <!-- 副标题开关：不支持置顶的字段整块不渲染，避免触发 tooltip 兜底内容 -->
          <SfTooltip v-if="subtitleCapable" :content="subtitleTip">
            <Icon
              @pointerdown.stop.prevent
              @click="toggleSubtitle"
              icon="lucide:heading-2"
              :class="[isSubtitle ? 'text-sf-theme' : '', subtitleFull ? 'opacity-50' : '']"
            />
          </SfTooltip>
          <SfTooltip v-if="hidden !== undefined" :content="hidden ? $t('show') : $t('hide')">
            <Icon
              @pointerdown.stop.prevent
              @click="toggleHidden"
              :icon="hidden ? 'lucide:eye' : 'lucide:eye-off'"
              :class="hidden ? 'text-sf-theme' : ''"
            />
          </SfTooltip>

          <Icon
            v-if="removable"
            @pointerdown.stop.prevent
            @click="clearField"
            icon="ic:round-delete"
          />
        </div>
      </div>
      <!-- 输入区：统一收敛控件高度，保持个人信息卡片紧凑 -->
      <div class="field-content w-full min-w-0">
        <slot />
      </div>
      <!-- 展示形态切换使用中性色，仅声明了展示选项的字段渲染。 -->
      <div v-if="displayOptions?.length" class="mt-1.5 w-full max-w-60">
        <SfTab v-model="display" :list="displayList" class="display-tabs h-8!" />
      </div>
    </div>
  </div>
  <!-- 重命名弹窗：仅自定义字段需要 -->
  <SfModal v-if="isCustomField" v-model="showRenameModal" :title="$t('editFieldName')">
    <form class="flex w-80 flex-col gap-3" @submit.prevent="handleRename">
      <SfInput v-model="fieldLabel" :placeholder="$t('fieldNamePlaceholder')" />
      <footer class="flex justify-end gap-3">
        <SfButton type="bg" @click="showRenameModal = false">{{ $t("cancel") }}</SfButton>
        <SfButton :disabled="!fieldLabel.trim()" @click="handleRename">{{ $t("save") }}</SfButton>
      </footer>
    </form>
  </SfModal>
</template>

<style lang="scss" scoped>
/* 个人信息字段卡片内的输入控件：统一收敛高度，保持卡片紧凑 */
.field-content {
  --el-component-size: 28px;

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    min-height: 28px;
  }

  :deep(.el-input__inner),
  :deep(.el-select__placeholder) {
    height: 28px;
    line-height: 28px;
  }
}

/* 图标底板内的图标选择触发器：底色由底板统一提供，悬停不再叠加圆形底色 */
.field-icon-tile :deep(.field-icon-picker),
.field-icon-tile :deep(.field-icon-picker [data-sf-icon-state]) {
  color: var(--color-sf-theme) !important;
  border-radius: 16px;
}

.field-icon-tile :deep(.field-icon-picker [data-sf-icon-state]:hover) {
  background-color: transparent !important;
}

/* 字段展示形态的选中与悬停反馈使用中性色。 */
.display-tabs {
  :deep(.bg-sf-theme) {
    background-color: var(--color-sf-primary);
  }

  :deep(.text-sf-theme-text) {
    color: var(--color-sf-text);
  }

  :deep(.tab-item:hover) {
    background-color: var(--color-sf-bg-2);
  }
}
</style>
