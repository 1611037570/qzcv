<script setup lang="ts">
import { getResumeJobField } from "@snowflake/resume-core";
// 求职方向跟随独立模块或个人信息的实际数据。
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { useResumeStore } from "@/stores";
import { describeResumeAiError, getResumeOptimizationBlockReason } from "@snowflake/resume-agent";
import { useResumeName } from "../hooks/useResumeName";
import { createResumeSnapshotForAi } from "../shared/resumeSnapshot";
import OptimizationPanel from "../components/aiOptimize/optimizationPanel.vue";
import ResumePreview from "../components/aiOptimize/resumePreview.vue";
import CapacityNotice from "../components/aiTask/capacityNotice.vue";
import { useResumeCapacity } from "../hooks/useResumeCapacity";
import { $t } from "@/locales";

const store = useResumeStore();
const route = useRoute();
const { getResumeTitle } = useResumeName();
const { remainingSlots, ensureCapacity } = useResumeCapacity();
const selectedId = ref("");
const loading = ref(true);
const loadError = ref("");
const error = ref("");
const openingDraft = ref(false);
// 表单只保存定制输入，不再依赖已删除的独立分析任务。
const input = reactive({
  position: "", // 本次定制的目标岗位。
  company: "", // 用于区分专属版本的目标公司。
  jd: "", // 用户粘贴的岗位要求。
});
const selectedResume = computed(() => store.resumeList.find((item) => item.id === selectedId.value));
// 定制开始时核对内容、布局和脱敏选择，避免使用过期资料。
const fingerprint = (item: any) => JSON.stringify([item?.data, item?.config, item?.ui, store.desensitizeMode]);
const sourceFingerprint = computed(() => fingerprint(selectedResume.value));
const options = computed(() => store.resumeList.map((item) => ({
  value: item.id, // 真实简历编号。
  name: getResumeTitle(item), // 项目统一的简历名称。
})));
const blockReason = computed(() => selectedResume.value
  ? getResumeOptimizationBlockReason(createResumeSnapshotForAi(selectedResume.value, false)) : "");
const canCustomize = computed(() => !!selectedResume.value && !!input.position.trim() && !!input.jd.trim() && !blockReason.value);
// 进入执行后固定本次简历与岗位资料。
const draftInput = ref<{
  resumeId: string; // 固定源简历编号。
  position: string; // 用户指定的目标岗位。
  jd: string; // 用户提供的岗位说明。
  title: string; // 专属版本标题。
  tag: string; // 另存时绑定的公司与岗位标签。
} | null>(null);
const optimizationPanel = ref<InstanceType<typeof OptimizationPanel> | null>(null);
let disposed = false;

const initialize = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    await store.loadActiveResumes();
    const queryId = String(route.query.id || "");
    selectedId.value = options.value.some((item) => item.value === queryId) ? queryId
      : options.value.some((item) => item.value === store.currentItem?.id) ? store.currentItem.id : options.value[0]?.value || "";
  } catch { loadError.value = $t("jobMatch_readFailed"); }
  finally { loading.value = false; }
};
onMounted(initialize);
watch(selectedId, () => { input.position = getResumeJobField(selectedResume.value?.data, "position").trim(); });
// 修改资料只清除当前提示，不触发任何额外分析请求。
watch([selectedId, () => input.position, () => input.company, () => input.jd, sourceFingerprint], () => { error.value = ""; });

const openDraft = async () => {
  if (!canCustomize.value || openingDraft.value || draftInput.value || store.isGenerating) return;
  if (!ensureCapacity()) return;
  openingDraft.value = true;
  // 跨异步读取固定定制资料，防止连点或切换岗位后使用过期输入。
  const targetId = selectedId.value;
  const targetBaseline = sourceFingerprint.value;
  const targetInput = { ...input };
  error.value = "";
  try {
    const source = await store.loadResume(targetId);
    if (disposed) return;
    if (!source || selectedId.value !== targetId || JSON.stringify(input) !== JSON.stringify(targetInput) || fingerprint(source) !== targetBaseline) {
      throw new Error($t("jobMatch_inputChanged"));
    }
    draftInput.value = {
      resumeId: targetId, // 固定本次定制的源简历。
      position: targetInput.position.trim(), // 用户指定的目标岗位。
      jd: targetInput.jd.trim(), // 用户提供的原始岗位说明。
      tag: [targetInput.company.trim(), targetInput.position.trim()].filter(Boolean).join(" · "), // 自动绑定本次投递目标。
      title: [targetInput.company.trim(), targetInput.position.trim(), $t("jobMatch_copySuffix")].filter(Boolean).join(" · "), // 用于另存版本的名称。
    };
  } catch (cause) { error.value = describeResumeAiError(cause); }
  finally { openingDraft.value = false; }
};
const closeDraft = () => {
  if (optimizationPanel.value?.canClose() === false) return;
  draftInput.value = null;
};
const notifySaved = () => ElMessage.success($t("jobMatch_savedToast"));
// 保存时阻止路由卸载，其余离开场景由请求取消机制收尾。
onBeforeRouteLeave(() => optimizationPanel.value?.canClose() !== false);
onBeforeUnmount(() => { disposed = true; });
</script>

<template>
  <main class="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden bg-sf-page p-3 text-sf-text">
    <header class="shrink-0">
      <h1 class="text-lg font-semibold">{{ $t('resumeNavJobMatch') }}</h1>
      <p class="mt-[6px] text-xs leading-6 text-sf-text-2">{{ $t("jobMatch_subtitle") }}</p>
    </header>
    <CapacityNotice v-if="!loading && !draftInput" />
    <div v-if="loading" class="flex min-h-0 flex-1 items-center justify-center gap-3 text-sm text-sf-text-2"><SfIcon icon="eos-icons:loading" size="6" />{{ $t("aiOptimize_loading") }}</div>
    <div v-else-if="loadError" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"><p class="text-sm text-sf-error">{{ loadError }}</p><SfButton type="bg" @click="initialize">{{ $t("aiOptimize_reload") }}</SfButton></div>
    <div v-else-if="!options.length" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"><p class="text-sm">{{ $t("jobMatch_noResume") }}</p><router-link to="/resume/mine" class="text-sm text-sf-theme hover:underline">{{ $t("jobMatch_goMine") }}</router-link></div>
    <section v-else-if="draftInput" class="min-h-0 flex-1 overflow-hidden rounded-xl border border-sf-b bg-sf-primary p-3">
      <OptimizationPanel ref="optimizationPanel" :resume-id="draftInput.resumeId" :initial-input="{ position: draftInput.position, jd: draftInput.jd, focus: 'jobMatch', jobAdaptation: true }" :copy-title="draftInput.title" :copy-tag="draftInput.tag" @saved="notifySaved" @close="closeDraft" />
    </section>
    <section v-else class="grid min-h-0 flex-1 grid-rows-2 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,390px)] lg:grid-rows-1">
      <section class="min-h-0 min-w-0 overflow-hidden rounded-xl border border-sf-b bg-sf-primary"><ResumePreview v-if="selectedResume" :item="selectedResume" /></section>
      <section class="flex min-h-0 min-w-0 flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3">
        <SfScrollbar flush class="min-h-0 flex-1">
          <!-- 岗位表单与模型接入保持相同的控件层次。 -->
          <form class="job-match-fields flex flex-col gap-3" @submit.prevent="openDraft">
            <label class="flex flex-col gap-[6px] text-xs font-medium">{{ $t("jobMatch_selectResume") }}<SfSelect v-model="selectedId" :list="options" :disabled="openingDraft" /></label>
            <label class="flex flex-col gap-[6px] text-xs font-medium">{{ $t("jobMatch_positionLabel") }}<SfInput v-model="input.position" :disabled="openingDraft" maxlength="100" :placeholder="$t('jobMatch_positionPlaceholder')" /></label>
            <label class="flex flex-col gap-[6px] text-xs font-medium">{{ $t("jobMatch_companyLabel") }}<SfInput v-model="input.company" :disabled="openingDraft" maxlength="100" :placeholder="$t('jobMatch_companyPlaceholder')" /></label>
            <label class="flex flex-col gap-[6px] text-xs font-medium">{{ $t("aiOptimize_jdLabel") }}<SfInput v-model="input.jd" :disabled="openingDraft" type="textarea" :rows="10" maxlength="15000" :placeholder="$t('jobMatch_jdPlaceholder')" /></label>
            <p class="rounded-xl bg-sf-theme-3 p-3 text-xs leading-6 text-sf-text-2">{{ $t("jobMatch_privacyTip") }}</p>
            <p v-if="blockReason" class="text-xs leading-6 text-sf-warning">{{ blockReason }}</p>
            <p v-if="error" role="alert" class="text-xs leading-6 text-sf-error">{{ error }}</p>
          </form>
        </SfScrollbar>
        <footer class="flex shrink-0 justify-end border-t border-sf-b pt-3"><SfButton icon="lucide:sparkles" :disabled="!remainingSlots || !canCustomize || openingDraft || store.isGenerating" @click="openDraft">{{ !remainingSlots ? $t('aiOptimize_capacityFull') : openingDraft ? $t('jobMatch_preparing') : store.isGenerating ? $t('jobMatch_taskRunning') : $t('jobMatch_generateDraft') }}</SfButton></footer>
      </section>
    </section>
  </main>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

/* 表单输入与服务商配置使用一致的主题边框。 */
.job-match-fields :deep(.el-input__wrapper),
.job-match-fields :deep(.el-select__wrapper),
.job-match-fields :deep(.el-textarea__inner) {
  @apply rounded-xl border border-sf-b bg-sf-bg text-sf-text shadow-none;
}
.job-match-fields :deep(.el-input__wrapper),
.job-match-fields :deep(.el-select__wrapper) {
  @apply min-h-9;
}
.job-match-fields :deep(.el-input__wrapper:hover),
.job-match-fields :deep(.el-select__wrapper:hover),
.job-match-fields :deep(.el-textarea__inner:hover) {
  @apply border-sf-theme;
}
</style>
