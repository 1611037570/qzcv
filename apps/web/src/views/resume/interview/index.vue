<script setup lang="ts">
import InterviewButton from "./interviewButton.vue";
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import type { InterviewConfig } from "@snowflake/interview-agent";
import confirm from "@/components/business/confirm";
import { $t } from "@/locales";
import { INTERVIEW_INTRO_PHASE, INTERVIEW_MODES, formatInterviewDuration, getInterviewCompletedCount, getInterviewQuestionLimit, getModeLabel, isPreparationMode } from "./config";
import { useInterviewSession } from "./useInterviewSession";
import type { InterviewSession } from "./types";
import SetupPanel from "./setupPanel.vue";
import InterviewRoom from "./interviewRoom.vue";

const { store, current, select, start, pause, resume, submit, clarify, finish, request } = useInterviewSession();
const historyVisible = ref(false);
const search = ref("");
const historyMode = ref("");
// 记录筛选复用项目下拉组件，选项名称与训练分类保持一致。
const historyModeOptions = INTERVIEW_MODES.map((mode) => ({
  value: mode.value, // 用于筛选记录的训练类型。
  name: mode.label, // 下拉选项显示的训练名称。
}));
const initialConfig = ref<InterviewConfig>();
const initialResumeId = ref("");
const setupKey = ref(0);
const initializing = ref(true);
const sessions = computed(() => [...store.sessions].sort((a, b) => b.updatedAt - a.updatedAt));
const filteredSessions = computed(() => sessions.value.filter((session) =>
  (!historyMode.value || session.config.mode === historyMode.value) &&
  (!search.value.trim() || `${session.title} ${session.config.company}`.toLowerCase().includes(search.value.trim().toLowerCase())),
));
const dateLabel = (time: number) => new Date(time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
// 文案生成与模拟面试使用各自的状态文案，历史记录不再混称训练结束。
const statusLabel = (session: InterviewSession) => isPreparationMode(session.config.mode)
  ? session.status === "completed" ? $t("interview_generated") : session.status === "active" ? $t("interview_generatingShort") : $t("interview_incomplete")
  : session.status === "completed" ? $t("interview_ended") : session.status === "active" ? $t("interview_inProgress") : $t("interview_paused");

// 仅加载新版独立面试记录，读取失败支持原地重试。
const initialize = async () => {
  initializing.value = true;
  try {
    await store.load();
  } finally { initializing.value = false; }
};
void initialize();

const newSession = (reuse = false) => {
  initialConfig.value = reuse && current.value ? { ...current.value.config } : undefined;
  initialResumeId.value = reuse && current.value ? current.value.resumeId : "";
  select("");
  setupKey.value += 1;
  historyVisible.value = false;
};
const openSession = (id: string) => { select(id); historyVisible.value = false; };
// 确认结束只作用于打开确认框时的会话，并拦截重复触发。
const confirmingEnd = ref(false);
const endSession = async () => {
  const id = current.value?.id;
  if (!id || confirmingEnd.value) return;
  confirmingEnd.value = true;
  try {
    await confirm($t("interview_endConfirmMessage"), $t("interview_endConfirmTitle"), { confirmText: $t("interview_endConfirmConfirm"), cancelText: $t("interview_continueAnswer") });
  } catch { return; }
  finally { confirmingEnd.value = false; }
  if (current.value?.id === id) await finish();
};
const deleteSession = async (session: InterviewSession) => {
  try {
    await confirm($t("interview_deleteConfirmMessage", { title: session.title }), $t("interview_deleteTitle"), { confirmText: $t("interview_delete"), cancelText: $t("interview_cancel") });
  } catch { return; }
  if (current.value?.id === session.id) select("");
  try { await store.remove(session.id); }
  catch { ElMessage.error($t("interview_deleteFailed")); }
};

// 导出可读记录，澄清与正式回答分开，保留停止、跳过和草稿的真实状态。
const exportSession = () => {
  const session = current.value;
  if (!session) return;
  const content = [
    `# ${session.title}`, $t("interview_exportCreatedAt", { time: new Date(session.createdAt).toLocaleString("zh-CN") }),
    `${$t("interview_exportMode", { mode: getModeLabel(session.config.mode) })}\n${$t("interview_exportPosition", { position: session.config.position })}\n${$t("interview_exportYears", { years: session.config.experienceYears })}\n${$t("interview_exportResume", { resume: session.resumeTitle || $t("interview_notLinked") })}\n${$t("interview_exportStatus", { status: statusLabel(session) })}\n${$t("interview_exportDuration", { duration: formatInterviewDuration(session.elapsedMs) })}`,
    ...(session.preparation.content ? [$t("interview_exportPreparation", { suffix: session.preparation.status === "complete" ? "" : $t("interview_exportIncomplete"), content: session.preparation.content })] : []),
    ...session.turns.map((turn, index) => [
      `## ${turn.phase === INTERVIEW_INTRO_PHASE ? $t("interview_exportIntro") : $t("interview_exportQuestion", { number: session.turns.slice(0, index + 1).filter((item) => item.phase !== INTERVIEW_INTRO_PHASE).length, phase: turn.phase })}${turn.question.status === "complete" ? "" : $t("interview_exportIncomplete")}`, turn.question.content,
      $t("interview_exportAnswerTime", { duration: formatInterviewDuration(turn.durationSeconds * 1000) }),
      ...(turn.clarifications?.map((item) => $t("interview_exportClarify", { suffix: item.reply.status === "complete" ? "" : $t("interview_exportIncomplete"), request: item.request, content: item.reply.content })) || []),
      turn.submitted ? $t("interview_exportAnswer", { answer: turn.skipped ? $t("interview_skipped") : turn.answer }) : $t("interview_exportNotSubmitted"),
      ...(turn.hint.content ? [$t("interview_exportHint", { content: turn.hint.content })] : []),
      ...(turn.reference.content ? [$t("interview_exportReference", { content: turn.reference.content })] : []),
    ].join("\n\n")),
    ...(session.report.content ? [$t("interview_exportReport", { suffix: session.report.status === "complete" ? "" : $t("interview_exportIncomplete"), content: session.report.content })] : []),
    ...(session.draft ? [$t("interview_exportDraft", { content: session.draft })] : []),
  ].join("\n\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" /* 可读的面试文本记录。 */ }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${session.title.replace(/[<>:"/\\|?*]/g, "-")}-${session.id.slice(0, 8)}.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
</script>

<template>
  <main class="interview-fields flex h-full min-h-0 min-w-0 flex-col gap-3 bg-sf-page p-3 text-sf-text">
    <header v-if="!current" class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <!-- 页头与其他助手页面使用一致的紧凑标题。 -->
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-sf-text">{{ $t('resumeNavInterview') }}</h1><p class="mt-[6px] text-xs leading-6 text-sf-text-2">{{ $t("interview_pageSubtitle") }}</p>
      </div>
      <nav class="flex flex-wrap items-center gap-3">
        <InterviewButton type="bg" :disabled="initializing || !store.ready" @click="historyVisible = true"><SfIcon icon="tabler:history" size="4" />{{ $t("interview_historyCount", { count: sessions.length }) }}</InterviewButton>
        <InterviewButton v-if="current" type="bg" @click="newSession()">{{ $t("interview_newSession") }}</InterviewButton>
      </nav>
    </header>
    <p v-if="store.saveError" class="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-sf-b bg-sf-primary p-3 text-sm text-sf-error" role="alert">{{ $t("interview_saveError", { error: store.saveError }) }}<InterviewButton type="bg" :disabled="store.saving > 0" @click="store.retrySave">{{ store.saving > 0 ? $t('interview_saving') : $t('interview_retrySave') }}</InterviewButton></p>
    <section v-if="initializing" class="flex min-h-60 flex-1 items-center justify-center gap-3 text-sm text-sf-text-2"><SfIcon icon="eos-icons:loading" size="6" />{{ $t("interview_loadingRecords") }}</section>
    <section v-else-if="store.loadError" class="flex flex-1 flex-col items-center justify-center gap-3"><p class="text-sf-error">{{ $t("interview_loadError", { error: store.loadError }) }}</p><InterviewButton @click="initialize">{{ $t("interview_reload") }}</InterviewButton></section>
    <!-- 面试中将记录与新建入口合入会话工具栏，避免上下两条导航重复占位。 -->
    <InterviewRoom v-else-if="current" :key="current.id" :session="current" @pause="pause" @resume="resume" @finish="endSession" @submit="submit" @clarify="clarify" @request="request" @again="newSession(true)" @export="exportSession">
      <template #navigation>
        <InterviewButton type="bg" @click="historyVisible = true"><SfIcon icon="tabler:history" size="4" />{{ $t("interview_historyCount", { count: sessions.length }) }}</InterviewButton>
        <InterviewButton type="bg" @click="newSession()">{{ $t("interview_newSession") }}</InterviewButton>
      </template>
    </InterviewRoom>
    <!-- 页面外层统一留白，滚动容器不再重复叠加内边距。 -->
    <SfScrollbar v-else flush class="min-h-0 flex-1">
      <SetupPanel :key="setupKey" :initial-config="initialConfig" :initial-resume-id="initialResumeId" @start="start" />
    </SfScrollbar>

    <SfModal v-model="historyVisible" :title="$t('interview_historyTitle')" width="860px">
      <section class="interview-fields flex w-full min-w-0 flex-col gap-3">
        <div class="interview-history-filters grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <SfInput v-model="search" :placeholder="$t('interview_searchPlaceholder')" :aria-label="$t('interview_searchAria')" clearable />
          <SfSelect v-model="historyMode" :list="historyModeOptions" :placeholder="$t('interview_allTypes')" :aria-label="$t('interview_filterAria')" clearable />
        </div>
        <section v-if="!filteredSessions.length" class="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sf-b p-3 text-center">
          <SfIcon icon="tabler:history" size="9" class="text-sf-text-2" /><h3 class="text-sm font-medium">{{ sessions.length ? $t('interview_noMatch') : $t('interview_emptyHistory') }}</h3>
          <p class="text-xs leading-6 text-sf-text-2">{{ sessions.length ? $t('interview_noMatchHint') : $t('interview_emptyHint') }}</p>
          <InterviewButton v-if="search || historyMode" type="bg" @click="search = ''; historyMode = ''">{{ $t("interview_clearFilters") }}</InterviewButton>
          <InterviewButton v-else type="bg" @click="historyVisible = false">{{ $t("interview_chooseFeature") }}</InterviewButton>
        </section>
        <SfScrollbar flush class="h-auto! flex-none!" max-height="60vh">
          <div class="flex flex-col gap-3">
          <!-- 悬停与聚焦统一反馈整行边框，内部打开按钮不再单独铺底色。 -->
          <article v-for="session in filteredSessions" :key="session.id" class="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:border-sf-theme focus-within:border-sf-theme" :class="current?.id === session.id ? 'border-sf-theme bg-sf-bg' : 'border-sf-b'">
            <button type="button" class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-sf-theme" @click="openSession(session.id)">
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sf-page text-sf-theme"><SfIcon :icon="isPreparationMode(session.config.mode) ? 'lucide:file-text' : 'ph:microphone-duotone'" size="5" /></span>
              <span class="flex min-w-0 flex-1 flex-col gap-3"><span class="flex flex-wrap items-center gap-3"><span class="break-words text-sm font-medium">{{ session.title }}</span><span class="text-xs" :class="session.status === 'completed' ? 'text-sf-success' : session.status === 'paused' ? 'text-sf-warning' : 'text-sf-theme'">{{ statusLabel(session) }}</span><span v-if="current?.id === session.id" class="text-xs text-sf-theme">{{ $t("interview_currentRecord") }}</span></span>
              <span class="text-xs leading-6 text-sf-text-2">{{ dateLabel(session.updatedAt) }} · {{ getModeLabel(session.config.mode) }}<template v-if="!isPreparationMode(session.config.mode)"> · {{ $t('interview_completedCount', { count: getInterviewCompletedCount(session.config, session.turns.filter(turn => turn.submitted)) }) }}<template v-if="getInterviewQuestionLimit(session.config)"> / {{ getInterviewQuestionLimit(session.config) }}</template> {{ session.config.mode === 'specialized' ? $t('interview_unitRounds') : $t('interview_unitQuestions') }}</template></span></span>
            </button>
            <InterviewButton type="error" plain @click="deleteSession(session)">{{ $t("interview_delete") }}</InterviewButton>
          </article>
          </div>
        </SfScrollbar>
      </section>
    </SfModal>
  </main>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

/* 使用可由 Tailwind 处理的样式入口，明确绘制面试表单边框与底色。 */
.interview-fields {
  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper),
  :deep(.el-textarea__inner) {
    @apply rounded-xl border border-sf-b bg-sf-bg text-sf-text;
  }

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    @apply min-h-9 px-3 py-0;
  }

  /* 内框填满随表单行拉伸的下拉外壳，避免底部露出重复底色。 */
  :deep(.el-select__wrapper) {
    @apply h-full;
  }

  :deep(.el-textarea__inner) {
    @apply p-3;
  }

  :deep(.el-input__wrapper:hover),
  :deep(.el-select__wrapper:hover),
  :deep(.el-textarea__inner:hover),
  :deep(.el-input__wrapper.is-focus),
  :deep(.el-select__wrapper.is-focused),
  :deep(.el-textarea__inner:focus) {
    @apply border-sf-theme;
  }

  /* 不可编辑状态保留边界和草稿可读性，与可输入状态明确区分。 */
  :deep(.el-input.is-disabled .el-input__wrapper),
  :deep(.el-select__wrapper.is-disabled),
  :deep(.el-textarea.is-disabled .el-textarea__inner) {
    @apply cursor-not-allowed border-sf-b bg-sf-page text-sf-text-2;
  }
}

/* 记录筛选使用紧凑控件，同高对齐，不改变开始页表单的尺寸。 */
.interview-history-filters :deep(.el-input__wrapper),
.interview-history-filters :deep(.el-select__wrapper) {
  @apply min-h-9 px-3 py-0;
}
</style>
