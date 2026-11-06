<script setup>
import { computed, ref, watch } from "vue";
import { useResumeStore } from "@/stores";
import { normalizeResumeTags } from "@/domain/resume/resumeTags";

const props = defineProps({
  modelValue: { type: Boolean, default: false }, // 标签弹窗是否显示。
  item: { type: Object, default: null }, // 当前修改标签的简历。
});
const emit = defineEmits(["update:modelValue"]);
const store = useResumeStore();
const visible = computed({
  get: () => props.modelValue, // 读取调用方的显示状态。
  set: (value) => emit("update:modelValue", value), // 同步弹窗关闭状态。
});
const tags = ref([]);
const tagInput = ref("");
const error = ref("");
// 输入文字后添加标签，中文输入法确认候选时不提前提交。
const addTag = (event) => {
  if (event?.isComposing) return;
  tags.value = normalizeResumeTags([...tags.value, tagInput.value]);
  tagInput.value = "";
};
// 删除只修改弹窗草稿，保存后才写入简历。
const removeTag = (tag) => { tags.value = tags.value.filter((value) => value !== tag); };
// 每次打开重新读取标签，取消时不修改原简历。
watch(() => props.modelValue, (opened) => {
  if (!opened) return;
  tags.value = normalizeResumeTags(props.item?.usage?.tags);
  tagInput.value = "";
  error.value = "";
});
const save = async () => {
  // 保存时一并收录输入框中尚未按回车的文字。
  addTag();
  if (!store.updateResumeTags(props.item?.id, tags.value)) {
    error.value = "resumeMineTagsUnavailable";
    return;
  }
  try {
    await store.savePendingResumes();
    visible.value = false;
  } catch {
    // 保存失败保留当前输入，允许用户重试。
    error.value = "resumeMineTagsSaveFailed";
  }
};
</script>

<template>
  <SfModal v-model="visible" :title="$t('resumeMineEditTags')">
    <div class="flex flex-col gap-3">
      <label class="flex flex-col gap-3 text-sm text-sf-text">
        {{ $t("resumeMineTagsLabel") }}
        <SfInput v-model="tagInput" :placeholder="$t('resumeMineTagsPlaceholder')" @keydown.enter.prevent="addTag" />
      </label>
      <!-- 已添加的标签逐项展示，支持独立删除。 -->
      <div v-if="tags.length" class="flex flex-wrap gap-3">
        <span v-for="tag in tags" :key="tag" class="inline-flex min-w-0 items-center gap-3 rounded-full bg-sf-bg px-3 text-xs leading-6 text-sf-text-2">
          <span class="break-all">{{ tag }}</span>
          <button type="button" class="shrink-0 cursor-pointer text-sf-text-3 hover:text-sf-error" :aria-label="`${$t('resumeMineDelete')} ${tag}`" @click="removeTag(tag)"><SfIcon icon="lucide:x" size="3" /></button>
        </span>
      </div>
      <p class="text-xs text-sf-text-3">{{ $t("resumeMineTagsHint") }}</p>
      <p v-if="error" role="alert" class="text-xs text-sf-error">{{ $t(error) }}</p>
      <footer class="flex justify-end gap-3">
        <SfButton type="bg" @click="visible = false">{{ $t("cancel") }}</SfButton>
        <SfButton @click="save">{{ $t("save") }}</SfButton>
      </footer>
    </div>
  </SfModal>
</template>
