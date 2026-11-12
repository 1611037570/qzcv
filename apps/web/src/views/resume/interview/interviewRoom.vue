<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useClipboard, useResizeObserver, useSpeechRecognition } from "@vueuse/core";
import { ElMessage, type ScrollbarInstance } from "element-plus";
import { hasInterviewModel } from "@snowflake/interview-agent";
import type { InterviewAction } from "@snowflake/interview-agent";
import type { InterviewSession } from "./types";
import confirm from "@/components/business/confirm";
import { $t } from "@/locales";
import { INTERVIEW_ACTION_LABELS, INTERVIEW_INTRO_PHASE, INTERVIEW_INTRO_SECONDS, formatInterviewDuration, getInterviewCompletedCount, getInterviewAnsweredTurns, getInterviewQuestionLimit, getInterviewStages, getModeLabel } from "./config";
import { getInterviewSessionState } from "./sessionFlow";
import OutputContent from "./outputContent.vue";
import InterviewButton from "./interviewButton.vue";
import InterviewModelSettings from "./interviewModelSettings.vue";

const props = defineProps<{
  session: InterviewSession; // 当前独立面试记录。
}>();
const emit = defineEmits<{
  pause: []; // 停止当前生成并暂停训练。
  resume: []; // 继续训练或重试中断任务。
  finish: []; // 结束提问并生成真实复盘。
  submit: [skip: boolean]; // 提交回答或主动跳过。
  clarify: []; // 针对原题澄清题意，不提交回答或推进阶段。
  request: [action: InterviewAction, turnId?: string]; // 结束后生成所选题目的思路或参考回答。
  again: []; // 复用当前设置新建一场。
  export: []; // 导出本场可读记录。
}>();
const state = computed(() => getInterviewSessionState(props.session));
const latest = computed(() => state.value.latestTurn);
const preparation = computed(() => state.value.preparation);
const introGeneration = computed(() => props.session.config.mode === "intro");
const generating = computed(() => state.value.generating);
const submittedCount = computed(() => state.value.submittedTurns.filter((turn) => turn.phase !== INTERVIEW_INTRO_PHASE).length);
const answeredCount = computed(() => getInterviewAnsweredTurns(state.value.submittedTurns).length);
const introduction = computed(() => state.value.introduction);
const remainingSeconds = computed(() => state.value.remainingSeconds);
const introExpired = computed(() => introduction.value && remainingSeconds.value === 0);
// 到时锁定输入，但仍允许确认提交保留的回答或明确跳过。
const canSubmit = computed(() => state.value.canSubmit);
const canAnswer = computed(() => state.value.canAnswer);
const questionLimit = computed(() => getInterviewQuestionLimit(props.session.config));
const completedCount = computed(() => getInterviewCompletedCount(props.session.config, state.value.submittedTurns));
const progress = computed(() => questionLimit.value ? Math.min(100, Math.round(completedCount.value / questionLimit.value * 100)) : 0);
const draft = computed({
  get: () => props.session.draft, // 当前面试独立保存的草稿。
  set: (value: string) => { if (canAnswer.value) props.session.draft = value; }, // 到时后不再接收编辑或语音结果，已输入内容仍由宿主保存。
});
const helper = ref<{
  action: "hint" | "reference"; // 本次回看的内容类型。
  turnId: string; // 本次回看的正式题编号。
} | null>(null);
const helperTurn = computed(() => props.session.turns.find((turn) => turn.id === helper.value?.turnId));
const helperGenerating = computed(() => !!helper.value && helperTurn.value?.[helper.value.action].status === "generating");
const firstReviewTurn = computed(() => props.session.turns.find((turn) => turn.submitted && turn.phase !== INTERVIEW_INTRO_PHASE && turn.question.status === "complete"));
// 面试资料与题目导航按需查看，不占用对话区域。
const informationVisible = ref(false);
const modelSettingsVisible = ref(false);
const afterModel = ref<"resume" | "clarification" | null>(null);
// 输入区随内容适度增长，保持对话始终有可阅读的空间。
const answerAutosize = {
  minRows: 2, // 空草稿时保持紧凑的两行高度。
  maxRows: 5, // 长回答最多展示五行，其余在输入区内滚动。
};
// 统一使用项目滚动条，并通过其真实滚动节点保留跟随与题目导航行为。
const scrollbar = ref<ScrollbarInstance>();
const scrollContainer = computed(() => scrollbar.value?.wrapRef);
const contentContainer = ref<HTMLElement>();
const followOutput = ref(true);
let previousScrollTop = 0;
let scrollFrame = 0;
const input = ref<{ focus: () => void }>();
const { copy, isSupported: copySupported } = useClipboard();
const phases = computed(() => getInterviewStages(props.session.config));
const currentPhase = computed(() => latest.value?.phase || phases.value[0]);
const reviewing = computed(() => state.value.reviewing);
const resumeLabel = computed(() => {
  if (introGeneration.value) return $t("interview_regenerate");
  if (introduction.value && props.session.pendingAction === "question") return $t("interview_startIntro");
  if (state.value.answerReady) return $t("interview_continueAnswer");
  return props.session.pendingAction ? $t("interview_regenerateAction", { action: INTERVIEW_ACTION_LABELS[props.session.pendingAction] }) : $t("interview_continueInterview");
});
const statusLabel = computed(() => {
  // 押题和自我介绍都是准备材料，不使用正式面试的结束状态文案。
  if (preparation.value) return props.session.status === "completed" ? $t("interview_generated") : props.session.status === "paused" ? $t("interview_generateIncomplete") : $t("interview_generating");
  if (props.session.status === "completed") return $t("interview_ended");
  if (props.session.status === "paused") return $t("interview_paused");
  if (generating.value && props.session.pendingAction) return $t("interview_generatingAction", { action: INTERVIEW_ACTION_LABELS[props.session.pendingAction] });
  return introExpired.value ? $t("interview_introTimeUpWaiting") : $t("interview_waitingAnswer");
});
const introductionNotice = computed(() => {
  if (introExpired.value) return $t("interview_introExpiredNotice");
  if (props.session.status === "paused") return state.value.answerReady
    ? $t("interview_timerPausedNotice")
    : $t("interview_timerNotStartedNotice");
  return $t("interview_introNoticeDefault");
});
// 作答框说明当前为何不可输入，保留草稿而不让用户误以为控件失效。
const answerPlaceholder = computed(() => {
  if (props.session.status === "paused") return $t("interview_answerPlaceholderPaused");
  if (generating.value) return props.session.pendingAction === "clarification" ? $t("interview_answerPlaceholderClarifying") : $t("interview_answerPlaceholderPreparing");
  if (introExpired.value) return $t("interview_answerPlaceholderIntroExpired");
  return introduction.value ? $t("interview_answerPlaceholderIntro") : $t("interview_answerPlaceholderDefault");
});
// 在作答位置解释当前真实状态，生成、暂停和到时不再共用普通作答提示。
const answerNotice = computed(() => {
  if (generating.value) return props.session.pendingAction === "clarification" ? $t("interview_noticeClarifying") : $t("interview_noticePreparingNext");
  if (props.session.status === "paused") return state.value.answerReady ? $t("interview_noticePausedReady") : $t("interview_noticePausedNotReady");
  if (isListening.value) return $t("interview_noticeTranscribing");
  if (introduction.value) return introductionNotice.value;
  return $t("interview_noticeSubmitNext");
});
// 开场单独编号，正式题目从第一题开始，跳过仍保留实际出题顺序。
const questionNumber = (index: number) => props.session.turns.slice(0, index + 1).filter((turn) => turn.phase !== INTERVIEW_INTRO_PHASE).length;

// 浏览器语音识别仅转写到草稿，由用户确认提交，不自动发送识别结果。
const { isSupported, isListening, result, error, start: startVoice, stop: stopVoice } = useSpeechRecognition({
  lang: props.session.config.language === "英语" ? "en-US" : "zh-CN", // 跟随本场面试语言。
  continuous: true, // 允许完成一段完整口述。
  interimResults: true, // 将识别中的文字同步到草稿。
});
let speechBase = "";
const toggleVoice = () => {
  if (isListening.value) { stopVoice(); return; }
  if (!canAnswer.value) return;
  speechBase = draft.value.trim();
  result.value = "";
  try { startVoice(); }
  catch { ElMessage.warning($t("interview_voiceStartFailed")); }
};
// 同步保留识别结果，避免录音结束与最终结果在同一轮更新时丢字。
watch(result, (value) => { if (isListening.value && canAnswer.value) draft.value = [speechBase, value].filter(Boolean).join(" "); }, { flush: "sync" });
watch(error, (value) => { if (value) ElMessage.warning($t("interview_voiceError")); });
// 下一帧再次检查作答权限和弹窗，防止生成结束抢走弹窗中的键盘焦点。
const focusAnswer = async () => {
  await nextTick();
  if (canAnswer.value && !helper.value && !informationVisible.value && !modelSettingsVisible.value) input.value?.focus();
};
// 固定开场可能在界面挂载前就已就绪，首次进入也立即聚焦作答框。
watch(canAnswer, (value) => {
  if (!value) stopVoice();
  else void focusAnswer();
}, { immediate: true });
watch(() => props.session.id, () => { stopVoice(); helper.value = null; followOutput.value = true; });
watch(() => latest.value?.id, () => { helper.value = null; });
onBeforeUnmount(stopVoice);

const handleScroll = () => {
  const element = scrollContainer.value;
  if (!element) return;
  const top = element.scrollTop;
  if (element.scrollHeight - top - element.clientHeight < 72) followOutput.value = true;
  else if (top < previousScrollTop - 1) followOutput.value = false;
  previousScrollTop = top;
};
// 将流式滚动合并到动画帧，内容增长本身不会被误判为用户上滑。
const followLatest = () => {
  if (!followOutput.value || scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const element = scrollContainer.value;
    if (!followOutput.value || !element) return;
    element.scrollTop = element.scrollHeight;
    previousScrollTop = element.scrollTop;
  });
};
const scrollToLatest = () => { followOutput.value = true; followLatest(); };
// Markdown 异步渲染后高度仍会变化，保持处于底部时继续跟随。
useResizeObserver(contentContainer, followLatest);
watch(() => [latest.value?.question.content, latest.value?.clarifications?.at(-1)?.reply.content, props.session.report.content, props.session.preparation.content, props.session.turns.length], followLatest, { flush: "post" });
onBeforeUnmount(() => { if (scrollFrame) cancelAnimationFrame(scrollFrame); });

const send = async (skip = false) => {
  if (!canSubmit.value || (!skip && !draft.value.trim())) return;
  stopVoice();
  const turnId = latest.value?.id;
  // 有草稿时防止误点跳过直接丢弃回答，取消后保留草稿继续编辑。
  if (skip && draft.value.trim()) {
    try { await confirm($t("interview_skipConfirmMessage"), $t("interview_skipConfirmTitle"), { confirmText: $t("interview_skipQuestion"), cancelText: $t("interview_continueEditing") }); }
    catch { return; }
  }
  if (!canSubmit.value || latest.value?.id !== turnId) return;
  followOutput.value = true;
  emit("submit", skip);
};
// 模型配置原地完成，重试不会离开当前面试或丢失已提交内容。
const openModelSettings = (next: "resume" | "clarification" | null = null) => {
  informationVisible.value = false;
  afterModel.value = next;
  modelSettingsVisible.value = true;
};
const continueSession = () => {
  if (!hasInterviewModel()) { openModelSettings("resume"); return; }
  emit("resume");
};
const modelConfigured = () => {
  if (afterModel.value === "resume") emit("resume");
  else if (afterModel.value === "clarification") emit("clarify");
  else if (helper.value) generateHelper();
  afterModel.value = null;
};
// 用明确入口区分题意疑问与正式作答，不按用户输入关键词猜测意图。
const clarifyQuestion = () => {
  if (!canSubmit.value || introduction.value) return;
  stopVoice();
  if (!hasInterviewModel()) { openModelSettings("clarification"); return; }
  followOutput.value = true;
  emit("clarify");
};
// 输入组件也可能派发普通事件，仅处理键盘确认并避开输入法组合输入。
const handleKeydown = (event: Event | KeyboardEvent) => {
  if (!(event instanceof KeyboardEvent) || event.isComposing || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  send();
};
// 回看请求按题目编号发送，模型缺失时原地设置后继续原题。
const generateHelper = () => {
  if (!helper.value || !state.value.canReviewAnswers) return;
  if (!hasInterviewModel()) { openModelSettings(); return; }
  emit("request", helper.value.action, helper.value.turnId);
};
const openHelper = (action: "hint" | "reference", turnId: string) => {
  if (!state.value.canReviewAnswers) return;
  helper.value = { action, turnId };
  if (helperTurn.value?.[action].status !== "complete") generateHelper();
};
// 关闭回看窗口只停止该次生成，完整面试与复盘仍保持已结束。
const closeHelper = () => {
  if (helperGenerating.value) emit("pause");
  helper.value = null;
  void focusAnswer();
};
// 生成稿与回看回答共用复制操作，不自动提交为候选人的作答。
const copyContent = async (content: string) => {
  if (!content) return;
  try { await copy(content); ElMessage.success($t("interview_copied")); }
  catch { ElMessage.error($t("interview_copyFailed")); }
};
// 选题后收起资料窗口，保留用户定位，不被后续输出拉回底部。
const navigateQuestion = (id: string) => {
  informationVisible.value = false;
  followOutput.value = false;
  scrollContainer.value?.querySelector(`[data-turn-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
};
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-sf-b bg-sf-primary" :class="preparation ? 'shrink-0' : 'flex-1'">
    <!-- 聊天只保留一条会话工具栏，资料与题目导航按需打开。 -->
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-sf-b p-3">
      <div class="flex min-w-0 items-center gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sf-bg text-sf-theme"><SfIcon :icon="preparation ? 'lucide:sparkles' : 'ph:microphone-duotone'" size="5" /></span>
        <div class="min-w-0">
          <h2 class="truncate text-sm font-semibold">{{ preparation ? session.title : session.config.position }}</h2>
          <p class="flex flex-wrap items-center gap-3 text-xs leading-6 text-sf-text-2">
            <span :class="session.status === 'paused' ? 'text-sf-warning' : session.status === 'completed' ? 'text-sf-success' : 'text-sf-theme'" role="status">{{ statusLabel }}</span>
            <span v-if="!preparation" class="font-mono tabular-nums">{{ formatInterviewDuration(session.elapsedMs) }}</span>
            <span>{{ preparation ? session.config.language : currentPhase }}</span>
            <span v-if="!preparation" class="tabular-nums">{{ $t("interview_answeredCount", { count: answeredCount }) }}<template v-if="questionLimit">{{ $t("interview_progress", { current: completedCount, total: questionLimit }) }}</template></span>
          </p>
        </div>
      </div>
      <nav class="flex flex-wrap items-center gap-3" :aria-label="$t('interview_actionsAria')">
        <slot name="navigation"></slot>
        <InterviewButton type="bg" :aria-expanded="informationVisible" @click="informationVisible = true"><SfIcon icon="ph:info-duotone" size="4" />{{ preparation ? $t('interview_generationInfo') : $t('interview_interviewInfo') }}</InterviewButton>
        <InterviewButton v-if="session.status === 'active'" type="bg" @click="stopVoice(); emit('pause')"><SfIcon icon="lucide:pause" size="4" />{{ generating ? $t('interview_stopGenerating') : $t('interview_pause') }}</InterviewButton>
        <InterviewButton v-if="session.status === 'paused' && (preparation || reviewing)" @click="continueSession">{{ resumeLabel }}</InterviewButton>
        <InterviewButton v-if="!preparation && !reviewing && session.status !== 'completed'" type="bg" @click="stopVoice(); emit('finish')">{{ $t("interview_endInterview") }}</InterviewButton>
        <InterviewButton v-if="preparation && copySupported && session.preparation.status === 'complete'" @click="copyContent(session.preparation.content)"><SfIcon icon="famicons:copy-outline" size="4" />{{ $t("interview_copy") }}</InterviewButton>
        <InterviewButton v-if="session.status === 'completed'" type="bg" @click="emit('again')">{{ preparation ? $t('interview_regenerateAfterAdjust') : $t('interview_practiceAgain') }}</InterviewButton>
      </nav>
    </header>
    <progress v-if="!preparation && questionLimit" class="h-[3px] w-full shrink-0 accent-sf-theme" :value="progress" max="100" :aria-label="$t('interview_completedProgress', { current: completedCount, total: questionLimit })"></progress>

    <!-- 准备稿按内容自然占高，长文仍可滚动，不再套用满屏聊天留白。 -->
    <section class="relative flex min-h-0 flex-col" :class="{ 'flex-1': !preparation }">
      <SfScrollbar ref="scrollbar" flush class="min-h-0" :class="preparation ? 'h-auto! flex-none!' : 'flex-1'" :max-height="preparation ? '70vh' : undefined" wrap-class="overscroll-contain" @scroll="handleScroll">
        <div ref="contentContainer" class="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3">
          <article v-if="preparation" class="flex min-w-0 flex-col gap-3">
            <h3 class="text-sm font-semibold">{{ introGeneration ? $t('interview_yourIntro') : $t('interview_prepMaterial') }}</h3>
            <OutputContent :id="session.id + '-preparation'" :output="session.preparation" compact class="interview-message" :loading-text="introGeneration ? $t('interview_generatingIntro') : $t('interview_preparingMaterial')" />
          </article>

          <!-- 头像与消息标题对齐，正文沿用同一左边界，避免逐层叠加留白。 -->
          <article v-for="(turn, index) in session.turns" :key="turn.id" :data-turn-id="turn.id" class="flex scroll-mt-3 flex-col gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sf-bg text-sf-theme" aria-hidden="true"><SfIcon icon="ph:microphone-duotone" size="4" /></span>
              <section class="flex min-w-0 flex-1 flex-col">
                <header class="flex min-h-6 flex-wrap items-center gap-3 text-xs text-sf-text-2">
                  <span class="font-semibold text-sf-text">{{ $t("interview_interviewerName") }}</span>
                  <span>{{ turn.phase === INTERVIEW_INTRO_PHASE ? $t('interview_introPhaseLabel') : $t('interview_questionLabel', { number: questionNumber(index), phase: turn.phase }) }}</span>
                  <span v-if="turn.id === latest?.id && !turn.submitted && !reviewing && turn.question.status === 'complete'" class="text-sf-theme">{{ $t("interview_currentQuestion") }}</span>
                </header>
                <OutputContent :id="turn.id + '-question'" :output="turn.question" compact class="interview-message" />
                <!-- 消息操作贴近正文下方，复用编辑器的复制图标，不推到整行最右侧。 -->
                <nav v-if="copySupported && turn.question.content && turn.question.status !== 'generating'" class="mt-3 flex items-center" :aria-label="$t('interview_questionActionsAria')">
                  <SfTooltip :content="$t('interview_copyQuestion')"><button type="button" class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-sf-text-3 hover:text-sf-theme focus-visible:outline-2 focus-visible:outline-sf-theme" :aria-label="$t('interview_copyQuestionAria')" @click="copyContent(turn.question.content)"><SfIcon icon="ph:copy-duotone" size="4" /></button></SfTooltip>
                </nav>
              </section>
            </div>

            <!-- 澄清始终归在原题下方，说明与用户疑问不冒充正式作答。 -->
            <section v-for="item in turn.clarifications" :key="item.id" class="ml-9 flex min-w-0 flex-col gap-3 rounded-xl border border-sf-b bg-sf-bg p-3">
              <p class="whitespace-pre-wrap break-words text-xs leading-6 text-sf-text-2">{{ $t("interview_clarifyLabel", { request: item.request }) }}</p>
              <OutputContent :id="item.id + '-clarification'" :output="item.reply" compact :loading-text="$t('interview_clarifying')" />
            </section>

            <div v-if="turn.submitted" class="ml-auto flex w-full max-w-[87%] items-start justify-end gap-3">
              <section class="min-w-0">
                <header class="flex min-h-6 flex-wrap items-center justify-end gap-3 text-xs text-sf-text-2"><span>{{ turn.skipped ? $t('interview_skipped') : $t('interview_submittedWithDuration', { duration: formatInterviewDuration(turn.durationSeconds * 1000) }) }}</span><span class="font-semibold text-sf-text">{{ $t("interview_you") }}</span></header>
                <p class="whitespace-pre-wrap break-words rounded-2xl rounded-tr-none border border-sf-b bg-sf-bg p-3 text-sm leading-6" :class="{ 'text-sf-text-2': turn.skipped }">{{ turn.skipped ? $t('interview_skippedQuestion') : turn.answer }}</p>
                <nav v-if="copySupported && !turn.skipped" class="mt-3 flex justify-end" :aria-label="$t('interview_answerActionsAria')">
                  <SfTooltip :content="$t('interview_copyAnswer')"><button type="button" class="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-sf-text-3 hover:text-sf-theme focus-visible:outline-2 focus-visible:outline-sf-theme" :aria-label="$t('interview_copyAnswerAria')" @click="copyContent(turn.answer)"><SfIcon icon="ph:copy-duotone" size="4" /></button></SfTooltip>
                </nav>
              </section>
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sf-b text-sf-text-2" aria-hidden="true"><SfIcon icon="ph:user-circle-duotone" size="4" /></span>
            </div>
            <!-- 统一结束后逐题回看，面试进行中不展示答案或思路入口。 -->
            <nav v-if="state.canReviewAnswers && turn.submitted && turn.phase !== INTERVIEW_INTRO_PHASE && turn.question.status === 'complete'" class="flex flex-wrap gap-3" :aria-label="$t('interview_reviewAria')">
              <InterviewButton type="bg" @click="openHelper('hint', turn.id)">{{ $t("interview_hint") }}</InterviewButton>
              <InterviewButton type="bg" @click="openHelper('reference', turn.id)">{{ $t("interview_reference") }}</InterviewButton>
            </nav>
          </article>

          <article v-if="session.report.status !== 'empty' || session.pendingAction === 'report'" class="rounded-2xl border border-sf-b">
            <header class="flex flex-wrap items-center justify-between gap-3 border-b border-sf-b p-3"><h3 class="flex items-center gap-3 text-sm font-semibold"><SfIcon icon="lucide:sparkles" size="5" class="text-sf-theme" />{{ session.endedEarly ? $t('interview_stageReview') : $t('interview_interviewReview') }}</h3><span class="text-xs text-sf-text-2">{{ $t("interview_basedOnSubmitted") }}</span></header>
            <OutputContent :id="session.id + '-report'" :output="session.report" :loading-text="$t('interview_generatingReport')" />
          </article>
          <details v-if="reviewing && session.draft" class="rounded-xl border border-sf-b p-3 text-sm leading-6"><summary class="cursor-pointer text-sf-text-2">{{ $t("interview_unsubmittedDraft") }}</summary><p class="mt-3 whitespace-pre-wrap break-words">{{ session.draft }}</p></details>
          <section v-if="session.status === 'completed' && !preparation" class="flex flex-wrap items-center justify-center gap-3 text-xs leading-6 text-sf-text-2"><p>{{ firstReviewTurn ? $t('interview_reviewAvailable') : $t('interview_endedSimple') }}</p><InterviewButton v-if="firstReviewTurn" type="bg" @click="navigateQuestion(firstReviewTurn.id)">{{ $t("interview_reviewPerQuestion") }}</InterviewButton></section>
        </div>
      </SfScrollbar>
      <!-- 与简历编辑器保持相同的圆形图标入口，点击后恢复跟随最新消息。 -->
      <button v-if="!followOutput" type="button" class="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-sf-theme" :aria-label="$t('interview_scrollToLatestAria')" @click="scrollToLatest">
        <SfIcon icon="mingcute:arrow-down-line" size="4" box-size="8" class="rounded-full border border-sf-b bg-sf-bg" />
      </button>
    </section>

    <!-- 输入框、作答工具与发送合成一个底部编辑区，计时不再单独占一张卡片。 -->
    <footer v-if="!preparation && !reviewing && session.status !== 'completed'" class="shrink-0 p-3">
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-3">
        <section class="interview-composer overflow-hidden rounded-2xl border transition-colors" :class="canAnswer ? 'border-sf-b bg-sf-primary focus-within:border-sf-theme' : 'border-sf-b bg-sf-page'">
          <header class="flex items-center justify-between gap-3 px-3 pt-3 text-xs text-sf-text-2">
            <h3 class="font-medium text-sf-text">{{ introduction ? $t('interview_introPhaseLabel') : $t('interview_answerCurrentQuestion') }}</h3>
            <span v-if="introduction" class="flex items-center gap-3" :class="remainingSeconds <= 30 ? 'text-sf-warning' : 'text-sf-theme'"><SfIcon icon="mdi:clock-outline" size="4" /><span class="font-mono text-base font-semibold tabular-nums" role="timer" :aria-label="$t('interview_introTimeAria')">{{ formatInterviewDuration(remainingSeconds * 1000) }}</span><span class="hidden text-xs text-sf-text-2 sm:inline">{{ $t("interview_remaining") }}</span></span>
            <span v-else class="tabular-nums">{{ draft.length }} / 12000</span>
          </header>
          <progress v-if="introduction" class="block h-[3px] w-full" :class="remainingSeconds <= 30 ? 'accent-sf-warning' : 'accent-sf-theme'" :value="remainingSeconds" :max="INTERVIEW_INTRO_SECONDS" :aria-label="$t('interview_introProgressAria')"></progress>
          <el-input ref="input" v-model="draft" type="textarea" :autosize="answerAutosize" :maxlength="12000" :disabled="!canAnswer" resize="none" :placeholder="answerPlaceholder" :aria-label="$t('interview_answerInputAria')" @keydown.enter="handleKeydown" />
          <div class="flex flex-wrap items-center justify-between gap-3 p-3">
            <nav class="flex flex-wrap items-center gap-3" :aria-label="$t('interview_answerToolsAria')">
              <InterviewButton v-if="isSupported" type="bg" :disabled="!canAnswer" :aria-pressed="isListening" :class="{ 'text-sf-error!': isListening }" @click="toggleVoice"><SfIcon :icon="isListening ? 'ph:stop-circle-fill' : 'ph:microphone-duotone'" size="4" />{{ isListening ? $t('interview_stopTranscribe') : $t('interview_voiceInput') }}</InterviewButton>
              <span v-else class="text-xs text-sf-text-2">{{ $t("interview_textAnswer") }}</span>
              <SfTooltip v-if="!introduction" :content="$t('interview_clarifyTip')"><InterviewButton type="bg" :disabled="!canSubmit" @click="clarifyQuestion">{{ $t("interview_clarify") }}</InterviewButton></SfTooltip>
            </nav>
            <div class="ml-auto flex items-center gap-3">
              <InterviewButton type="bg" :disabled="!canSubmit" @click="send(true)">{{ introduction ? $t('interview_skipIntro') : $t('interview_skipQuestion') }}</InterviewButton>
              <!-- 暂停时原位显示恢复操作，不额外占用一张提示卡片。 -->
              <InterviewButton v-if="session.status === 'paused'" @click="continueSession"><SfIcon icon="lucide:play" size="4" />{{ resumeLabel }}</InterviewButton>
              <InterviewButton v-else-if="generating" type="bg" @click="emit('pause')"><SfIcon icon="lucide:pause" size="4" />{{ $t("interview_stopGenerating") }}</InterviewButton>
              <InterviewButton v-else :disabled="!canSubmit || !draft.trim()" @click="send()">{{ introExpired ? $t('interview_confirmSubmit') : $t('interview_submitAnswer') }}<SfIcon icon="icon-park-outline:send-one" size="4" /></InterviewButton>
            </div>
          </div>
        </section>
        <p class="flex flex-wrap items-center justify-between gap-3 text-xs leading-6 text-sf-text-2" role="status"><span :class="{ 'text-sf-error': isListening }">{{ answerNotice }}</span><span v-if="canSubmit" class="hidden shrink-0 sm:inline">{{ $t("interview_submitShortcut") }}</span></p>
      </div>
    </footer>

    <SfModal v-model="informationVisible" :title="preparation ? $t('interview_generationInfo') : $t('interview_thisInterview')" width="600px">
      <SfScrollbar flush class="h-auto! flex-none!" max-height="60vh">
        <section class="flex flex-col gap-3">
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-sf-b p-3 text-sm leading-6">
            <template v-if="session.config.position"><dt class="text-sf-text-2">{{ $t("interview_positionLabel") }}</dt><dd class="break-words">{{ session.config.position }}</dd></template>
            <template v-if="!introGeneration"><dt class="text-sf-text-2">{{ $t("interview_yearsLabel") }}</dt><dd>{{ session.config.experienceYears }}</dd></template>
            <dt class="text-sf-text-2">{{ $t("interview_typeLabel") }}</dt><dd>{{ getModeLabel(session.config.mode) }}</dd>
            <dt class="text-sf-text-2">{{ $t("interview_languageLabel") }}</dt><dd>{{ session.config.language }}</dd>
            <template v-if="session.config.mode === 'specialized'"><dt class="text-sf-text-2">{{ $t("interview_focusLabel") }}</dt><dd>{{ session.config.direction }}</dd></template>
            <dt class="text-sf-text-2">{{ $t("interview_resumeLabel") }}</dt><dd class="break-words">{{ session.resumeTitle || $t("interview_notLinked") }}</dd>
          </dl>
          <section v-if="!preparation" class="flex flex-col gap-3 rounded-xl border border-sf-b p-3">
            <header class="flex flex-wrap items-center justify-between gap-3"><h3 class="text-sm font-semibold">{{ $t("interview_progressTitle") }}</h3><span class="text-xs text-sf-text-2">{{ $t("interview_answeredSubmitted", { answered: answeredCount, submitted: submittedCount }) }}</span></header>
            <p v-if="questionLimit" class="text-xs text-sf-text-2">{{ $t("interview_completedUnit", { current: completedCount, total: questionLimit, unit: session.config.mode === 'specialized' ? $t('interview_unitRounds') : $t('interview_unitQuestions') }) }}</p>
            <ol class="flex flex-wrap gap-3 text-xs"><li v-for="phase in phases" :key="phase" class="rounded-xl border p-3" :class="currentPhase?.startsWith(phase) ? 'border-sf-theme text-sf-theme' : 'border-sf-b text-sf-text-2'" :aria-current="currentPhase?.startsWith(phase) ? 'step' : undefined">{{ phase }}</li></ol>
            <nav v-if="session.turns.length" class="flex flex-wrap gap-3" :aria-label="$t('interview_questionNavAria')">
              <button v-for="(turn, index) in session.turns" :key="turn.id" type="button" class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border text-xs hover:border-sf-theme focus-visible:outline-2 focus-visible:outline-sf-theme" :class="turn.id === latest?.id ? 'border-sf-theme text-sf-theme' : 'border-sf-b text-sf-text-2'" :aria-label="turn.phase === INTERVIEW_INTRO_PHASE ? $t('interview_viewIntroAria') : $t('interview_viewQuestionAria', { number: questionNumber(index) })" @click="navigateQuestion(turn.id)">{{ turn.phase === INTERVIEW_INTRO_PHASE ? $t('interview_introShort') : questionNumber(index) }}</button>
            </nav>
          </section>
          <details v-if="session.config.jobDescription" class="rounded-xl border border-sf-b p-3 text-xs leading-6"><summary class="cursor-pointer font-semibold">{{ $t("interview_jobRequirementTitle") }}</summary><p class="mt-3 whitespace-pre-wrap break-words text-sf-text-2">{{ session.config.jobDescription }}</p></details>
          <nav class="flex flex-wrap gap-3"><InterviewButton v-if="!introGeneration" type="bg" @click="emit('export')">{{ $t("interview_exportRecord") }}</InterviewButton><InterviewButton type="bg" @click="openModelSettings()">{{ $t("interview_interviewSettings") }}</InterviewButton></nav>
        </section>
      </SfScrollbar>
    </SfModal>

    <SfModal :model-value="!!helper && !modelSettingsVisible" :title="helper?.action === 'hint' ? $t('interview_hint') : $t('interview_reference')" width="600px" @update:model-value="closeHelper">
      <div v-if="helper && helperTurn" class="flex min-w-0 flex-col gap-3">
        <p class="text-xs leading-6 text-sf-text-2">{{ $t("interview_helperNotice") }}</p>
        <SfScrollbar flush class="h-auto! flex-none!" max-height="50vh"><OutputContent :id="helperTurn.id + '-' + helper.action + '-modal'" :output="helperTurn[helper.action]" compact :loading-text="helper.action === 'hint' ? $t('interview_generatingHint') : $t('interview_generatingReference')" /></SfScrollbar>
        <InterviewButton v-if="helperGenerating" type="bg" @click="emit('pause')">{{ $t("interview_stopGenerating") }}</InterviewButton>
        <div v-else class="flex flex-wrap justify-end gap-3">
          <InterviewButton v-if="copySupported && helperTurn[helper.action].content" type="bg" @click="copyContent(helperTurn[helper.action].content)">{{ $t("interview_copy") }}</InterviewButton>
          <InterviewButton type="bg" @click="generateHelper">{{ helperTurn[helper.action].status === 'complete' ? $t('interview_regenerateAnother') : $t('interview_regenerate') }}</InterviewButton>
          <InterviewButton @click="closeHelper">{{ $t("interview_backToReview") }}</InterviewButton>
        </div>
      </div>
    </SfModal>
    <InterviewModelSettings v-model="modelSettingsVisible" @ready="modelConfigured" />
  </section>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

/* 使用相同的 Tailwind 样式入口，确保作答框去重边框规则实际生效。 */
.interview-composer :deep(.el-textarea__inner) {
  @apply rounded-none! border-none! bg-transparent! text-sm leading-6;
  box-shadow: none !important;
}

/* 对话正文独立于报告排版，常见标题不再打断聊天的阅读层级。 */
.interview-message,
.interview-message :deep(.md-editor-preview) {
  @apply text-sm leading-6;
}
.interview-message :deep(.md-editor-preview h1),
.interview-message :deep(.md-editor-preview h2),
.interview-message :deep(.md-editor-preview h3) {
  @apply text-sm leading-6 font-semibold;
}
</style>
