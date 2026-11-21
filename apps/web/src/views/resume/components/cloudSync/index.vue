<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useIntervalFn } from "@vueuse/core";

import i18n, { $t } from "@/locales";
import { useResumeStore } from "@/stores";
import { getClientId } from "@/hooks";
import { compactResumeItem } from "@/domain/resume/theme/resumeUi";
import { fetchResumeSync, publishResumeSync } from "@/apis";
import { useResumeName } from "../../hooks/useResumeName";

// 设备互传：简历放进服务端内存换一个 6 位取件码，另一台设备凭码取回
const MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_TTL_SECONDS = 300;
const CODE_LENGTH = 6;

const props = defineProps({
  modelValue: { type: Boolean, default: false }, // 弹窗是否显示
  item: { type: Object, default: null }, // 默认选中的简历，为空时选第一份
  jumpAfterReceive: { type: Boolean, default: false }, // 领取后是否跳到该简历
});
const emit = defineEmits(["update:modelValue"]);

const resumeStore = useResumeStore();
const { getResumeTitle } = useResumeName();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const activeTab = ref("publish");
const resumes = computed<any[]>(() => resumeStore.resumeList);
const selectedId = ref("");
const selectedItem = computed<any>(() => {
  const list = resumes.value;
  return list.find((item) => item.id === selectedId.value) ?? list[0] ?? null;
});
const resumeOptions = computed(() => resumes.value.map((item) => ({
  name: getResumeTitle(item), // 选项名称
  icon: "lucide:file-text", // 简历图标
  active: item.id === selectedItem.value?.id, // 当前选中项
  fn: () => { selectedId.value = item.id; }, // 切换同步目标
})));

const sizeBytes = ref(0);
const oversize = computed(() => sizeBytes.value > MAX_BYTES);
const publishing = ref(false);
const publishError = ref("");
const code = ref("");
const expireAt = ref(0);
const remainSeconds = ref(0);
const expired = computed(() => !!code.value && remainSeconds.value <= 0);
const inputCode = ref("");
const fetching = ref(false);

const hints = computed(() => {
  i18n.global.locale.value; // 跟随语言切换刷新说明
  return [
    { icon: "lucide:server", text: $t("resumeCloudSyncHintStorage") },
    { icon: "bi:shield-exclamation", text: $t("resumeCloudSyncHintCode") },
    { icon: "lucide:image", text: $t("resumeCloudSyncHintSize") },
  ];
});

const sizeText = computed(() => `${formatSize(sizeBytes.value)} / ${formatSize(MAX_BYTES)}`);
const remainText = computed(() => {
  const total = Math.max(0, remainSeconds.value);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});

const { pause: pauseTimer, resume: startTimer } = useIntervalFn(() => {
  remainSeconds.value = Math.max(0, Math.ceil((expireAt.value - Date.now()) / 1000));
  if (remainSeconds.value <= 0) pauseTimer();
}, 1000, { immediate: false });

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

// 序列化成纯数据，供体积校验与上传共用
function buildPayload() {
  if (!selectedItem.value) return null;
  try {
    return JSON.parse(JSON.stringify(compactResumeItem(selectedItem.value) ?? {}));
  } catch {
    return null;
  }
}

function prepare() {
  const current = buildPayload();
  sizeBytes.value = current ? new Blob([JSON.stringify(current)]).size : 0;
}

function resetState() {
  pauseTimer();
  publishing.value = false;
  publishError.value = "";
  code.value = "";
  expireAt.value = 0;
  remainSeconds.value = 0;
  inputCode.value = "";
  fetching.value = false;
  prepare();
}

watch(
  () => props.modelValue,
  async (opened) => {
    if (!opened) {
      pauseTimer();
      return;
    }
    try {
      await resumeStore.loadActiveResumes();
    } catch {
      // 读取失败时用已加载的记录，不阻断弹窗
    }
    selectedId.value = props.item?.id || resumes.value[0]?.id || "";
    activeTab.value = resumes.value.length ? "publish" : "fetch";
    resetState();
  },
);

// 换目标时旧码对应的已是另一份简历，直接清掉
watch(selectedId, () => {
  if (code.value) {
    pauseTimer();
    code.value = "";
    expireAt.value = 0;
    remainSeconds.value = 0;
    publishError.value = "";
  }
  prepare();
});

watch(activeTab, (tab) => {
  if (tab === "publish") prepare();
});

function resolveError(error: any, fallback: string) {
  const status = error?.response?.status;
  if (status === 413) return $t("resumeCloudSyncTooLarge");
  if (status === 429) return $t("resumeCloudSyncTooMany");
  if (status === 404) return $t("resumeCloudSyncReceiveFailed");
  const message = error?.response?.data?.message;
  return typeof message === "string" && message ? message : fallback;
}

async function handlePublish() {
  if (publishing.value || !selectedItem.value || oversize.value) return;
  const current = buildPayload();
  if (!current) {
    ElMessage.warning($t("resumeCloudSyncNoResume"));
    return;
  }
  sizeBytes.value = new Blob([JSON.stringify(current)]).size;
  publishing.value = true;
  publishError.value = "";
  try {
    const result = await publishResumeSync(getClientId(), current);
    code.value = String(result?.code ?? "").toUpperCase();
    expireAt.value = Number(result?.expiresAt) > 0
      ? Number(result.expiresAt)
      : Date.now() + DEFAULT_TTL_SECONDS * 1000;
    remainSeconds.value = Math.max(0, Math.ceil((expireAt.value - Date.now()) / 1000));
    startTimer();
  } catch (error) {
    publishError.value = resolveError(error, $t("resumeCloudSyncPublishFailed"));
  } finally {
    publishing.value = false;
  }
}

async function copyCode() {
  if (!code.value || expired.value) return;
  try {
    await navigator.clipboard.writeText(code.value);
    ElMessage.success($t("resumeCloudSyncCopied"));
  } catch {
    ElMessage.warning($t("resumeCloudSyncCopyFailed"));
  }
}

// 粘贴或输入时统一成大写字母与数字
function normalizeCode(value?: string) {
  const raw = typeof value === "string" ? value : inputCode.value;
  inputCode.value = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, CODE_LENGTH);
}

async function handleFetch() {
  normalizeCode();
  if (inputCode.value.length !== CODE_LENGTH) {
    ElMessage.warning($t("resumeCloudSyncCodeRequired"));
    return;
  }
  if (fetching.value) return;
  fetching.value = true;
  try {
    const result = await fetchResumeSync(inputCode.value);
    const receivedId = resumeStore.receiveSyncedResume(result?.data, props.jumpAfterReceive);
    if (!receivedId) return;
    ElMessage.success($t("resumeCloudSyncReceiveSuccess"));
    inputCode.value = "";
    visible.value = false;
  } catch (error) {
    ElMessage.error(resolveError(error, $t("resumeCloudSyncReceiveFailed")));
  } finally {
    fetching.value = false;
  }
}
</script>

<template>
  <SfModal v-model="visible" :title="$t('resumeCloudSyncTitle')" width="480px">
    <div class="flex w-full flex-col gap-3">
      <!-- 先说这个功能是干什么的，再给安全与限制说明 -->
      <span class="text-sm leading-normal text-sf-text-2">{{ $t("resumeCloudSyncSubtitle") }}</span>
      <div class="flex flex-col gap-1.5 rounded-2xl bg-sf-bg p-3">
        <div v-for="hint in hints" :key="hint.icon" class="flex items-start gap-1.5">
          <SfIcon :icon="hint.icon" size="3.5" class="mt-0.5 shrink-0 text-sf-text-3" />
          <span class="text-xs leading-normal text-sf-text-2">{{ hint.text }}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-1.5 rounded-2xl bg-sf-bg p-1">
        <button
          type="button"
          class="cursor-pointer rounded-xl py-1.5 text-sm transition-colors"
          :class="activeTab === 'publish' ? 'bg-sf-primary font-medium text-sf-text' : 'text-sf-text-3 hover:text-sf-text'"
          @click="activeTab = 'publish'"
        >
          {{ $t("resumeCloudSyncTabPublish") }}
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-xl py-1.5 text-sm transition-colors"
          :class="activeTab === 'fetch' ? 'bg-sf-primary font-medium text-sf-text' : 'text-sf-text-3 hover:text-sf-text'"
          @click="activeTab = 'fetch'"
        >
          {{ $t("resumeCloudSyncTabFetch") }}
        </button>
      </div>

      <div v-if="activeTab === 'publish'" class="flex flex-col gap-3">
        <SfDropdown v-if="resumes.length" trigger="click" placement="bottom-start" :show-arrow="false">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-sf-b p-3 text-left transition-colors hover:border-sf-theme"
          >
            <div class="flex min-w-0 flex-col gap-1">
              <span class="truncate text-sm font-medium">{{ getResumeTitle(selectedItem) }}</span>
              <span class="text-xs" :class="oversize ? 'text-sf-error' : 'text-sf-text-3'">{{ sizeText }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <SfIcon v-if="oversize" icon="bi:shield-exclamation" size="5" class="text-sf-error" />
              <SfIcon icon="lucide:chevron-down" size="4" class="text-sf-text-3" />
            </div>
          </button>
          <template #dropdown>
            <SfList :list="resumeOptions" class="w-60" />
          </template>
        </SfDropdown>
        <div v-else class="rounded-2xl border border-sf-b p-3 text-sm text-sf-text-3">
          {{ $t("resumeCloudSyncNoResume") }}
        </div>

        <div v-if="code" class="flex flex-col items-center gap-3 rounded-2xl bg-sf-bg p-3">
          <span class="text-xs text-sf-text-3">{{ $t("resumeCloudSyncCodeLabel") }}</span>
          <span
            class="font-mono text-3xl font-bold tracking-[0.3em] text-sf-theme"
            :class="expired ? 'opacity-40' : ''"
          >{{ code }}</span>
          <span class="text-xs" :class="expired ? 'text-sf-error' : 'text-sf-text-2'">
            {{ expired ? $t("resumeCloudSyncExpired") : $t("resumeCloudSyncRemain", { time: remainText }) }}
          </span>
          <div class="flex items-center gap-3">
            <SfButton type="bg" border :disabled="expired" @click="copyCode">{{ $t("resumeCloudSyncCopy") }}</SfButton>
            <SfButton type="bg" border :disabled="publishing" @click="handlePublish">
              {{ $t("resumeCloudSyncRegenerate") }}
            </SfButton>
          </div>
          <span class="text-center text-xs leading-normal text-sf-text-3">{{ $t("resumeCloudSyncDestroyHint") }}</span>
        </div>

        <div v-else class="flex flex-col gap-3">
          <span class="text-xs leading-normal text-sf-text-2">{{ $t("resumeCloudSyncPublishHint") }}</span>
          <div class="flex items-center justify-end">
            <SfButton :disabled="!selectedItem || oversize || publishing" @click="handlePublish">
              <SfIcon
                v-if="publishing"
                icon="line-md:loading-twotone-loop"
                size="4"
                class="mr-1.5 animate-spin"
              />
              {{ publishing ? $t("resumeCloudSyncPublishing") : $t("resumeCloudSyncPublish") }}
            </SfButton>
          </div>
        </div>

        <span v-if="oversize" class="text-xs text-sf-error">{{ $t("resumeCloudSyncTooLarge") }}</span>
        <span v-else-if="publishError" class="text-xs text-sf-error">{{ publishError }}</span>
      </div>

      <div v-else class="flex flex-col gap-3">
        <span class="text-xs leading-normal text-sf-text-2">{{ $t("resumeCloudSyncFetchHint") }}</span>
        <SfInput
          v-model="inputCode"
          :maxlength="CODE_LENGTH"
          :placeholder="$t('resumeCloudSyncCodePlaceholder')"
          class="border border-sf-b bg-sf-bg text-center text-lg tracking-[0.3em]"
          @input="normalizeCode"
        />
        <div class="flex items-center justify-end">
          <SfButton :disabled="fetching" @click="handleFetch">
            <SfIcon v-if="fetching" icon="line-md:loading-twotone-loop" size="4" class="mr-1.5 animate-spin" />
            {{ fetching ? $t("resumeCloudSyncFetching") : $t("resumeCloudSyncFetch") }}
          </SfButton>
        </div>
      </div>
    </div>
  </SfModal>
</template>
