<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useResumeStore } from "@/stores";
import { useResumeName } from "../hooks/useResumeName";
import ResumePreview from "../components/aiOptimize/resumePreview.vue";
import OptimizationPanel from "../components/aiOptimize/optimizationPanel.vue";
import { getResumeOptimizationBlockReason } from "@snowflake/resume-agent";
import { createResumeSnapshotForAi } from "../shared/resumeSnapshot";
import { useResumeCapacity } from "../hooks/useResumeCapacity";
import CapacityNotice from "../components/aiTask/capacityNotice.vue";

const store = useResumeStore();
const route = useRoute();
const { remainingSlots, ensureCapacity } = useResumeCapacity();
const { getResumeTitle } = useResumeName();
const selectedId = ref("");
// 正在优化的简历编号，为空时右侧展示所选简历预览。
const activeId = ref("");
const loading = ref(true);
const error = ref("");
const selectedResume = computed(() => store.resumeList.find((item) => item.id === selectedId.value));
// 本地先判定是否有真实内容，空简历不开放优化执行入口。
const blockReason = computed(() => selectedResume.value
  ? getResumeOptimizationBlockReason(createResumeSnapshotForAi(selectedResume.value, false)) : "");
const options = computed(() => store.resumeList.map((item) => ({
  value: item.id, // 选中的真实简历编号。
  name: getResumeTitle(item), // 沿用项目统一简历标题。
})));
const initialize = async () => {
  loading.value = true;
  error.value = "";
  try {
    await store.loadActiveResumes();
    selectedId.value = options.value.some((item) => item.value === store.currentItem?.id) ? store.currentItem.id : options.value[0]?.value || "";
    // 其他入口跳转过来时带简历编号，直接在页面内展开优化流程。
    const queryId = String(route.query.id || "");
    if (queryId && options.value.some((item) => item.value === queryId)) {
      selectedId.value = queryId;
      if (ensureCapacity()) activeId.value = queryId;
    }
  } catch { error.value = "简历读取失败，请重试。"; }
  finally { loading.value = false; }
};
onMounted(initialize);
// 优化流程在页面内展开，不再打开独立弹窗。
const open = () => { if (selectedId.value && !blockReason.value && ensureCapacity()) activeId.value = selectedId.value; };
const close = () => { activeId.value = ""; };
</script>

<template>
  <main class="flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden bg-sf-page p-3 text-sf-text">
    <header class="shrink-0"><h1 class="text-lg font-semibold">{{ $t('resumeNavAiOptimize') }}</h1><p class="mt-[6px] text-xs leading-6 text-sf-text-2">选择简历，一次优化。在预览中确认效果，再决定保存或放弃。</p></header>
    <CapacityNotice v-if="!loading && !activeId" />
    <div v-if="loading" class="flex min-h-0 flex-1 items-center justify-center gap-3 text-sm text-sf-text-2"><SfIcon icon="eos-icons:loading" size="6" />正在读取简历…</div>
    <div v-else-if="error" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"><p class="text-sm text-sf-error">{{ error }}</p><SfButton type="bg" @click="initialize">重新读取</SfButton></div>
    <div v-else-if="!options.length" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center"><h2 class="text-lg font-medium">先准备一份简历</h2><p class="text-sm text-sf-text-2">创建或导入简历后，就可以开始优化。</p><router-link to="/resume/mine" class="text-sm text-sf-theme hover:underline">前往我的简历</router-link></div>
    <section v-else-if="activeId" class="min-h-0 flex-1 overflow-hidden rounded-xl border border-sf-b bg-sf-primary p-3">
      <OptimizationPanel :key="activeId" :resume-id="activeId" @close="close" />
    </section>
    <section v-else class="grid min-h-0 flex-1 grid-rows-2 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,390px)] lg:grid-rows-1">
      <section class="min-h-0 min-w-0 overflow-hidden rounded-xl border border-sf-b bg-sf-primary"><ResumePreview v-if="selectedResume" :key="selectedId" :item="selectedResume" /></section>
      <section class="flex min-h-0 min-w-0 flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3">
        <SfScrollbar flush class="min-h-0 flex-1">
          <!-- 简历选择沿用模型接入的紧凑表单样式。 -->
          <label class="optimize-select flex flex-col gap-[6px] text-xs font-medium">选择简历<SfSelect v-model="selectedId" :list="options" placeholder="请选择简历" aria-label="选择需要优化的简历" /></label>
          <p v-if="blockReason" class="mt-3 rounded-xl bg-sf-warning-2 p-3 text-xs leading-6 text-sf-warning" role="status">{{ blockReason }}</p>
          <router-link v-if="blockReason" :to="{ path: '/resume/editor', query: { id: selectedId } }" class="mt-3 inline-block text-xs text-sf-theme hover:underline">去填写简历</router-link>
        </SfScrollbar>
        <footer class="flex shrink-0 justify-end border-t border-sf-b pt-3"><SfButton icon="lucide:sparkles" :disabled="!remainingSlots || !selectedId || !!blockReason || store.isGenerating" @click="open">{{ !remainingSlots ? '简历数量已达上限' : store.isGenerating ? '优化任务进行中' : blockReason ? '暂无可优化内容' : '优化这份简历' }}</SfButton></footer>
      </section>
    </section>
  </main>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

/* 选择控件使用与其他助手页面一致的主题底色。 */
.optimize-select :deep(.el-select__wrapper) {
  @apply min-h-9 rounded-xl border border-sf-b bg-sf-bg text-sf-text shadow-none;
}
.optimize-select :deep(.el-select__wrapper:hover) {
  @apply border-sf-theme;
}
</style>
