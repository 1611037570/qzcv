<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useResumeStore } from "@/stores";
import eventBus from "@/utils/modules/eventBus";
import { parsePdfResume, type ParsedPdfResume } from "./pdfReader";
import { comparePdfResume, type PdfFieldResult } from "./compareResume";
import { $t } from "@/locales";

const visible = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const error = ref("");
const fileName = ref("");
const parsed = ref<ParsedPdfResume | null>(null);
const results = ref<PdfFieldResult[]>([]);
const compareCurrent = ref(true);
const comparisonItem = ref<any>(null);
const resumeStore = useResumeStore();
let runVersion = 0;

const matchedCount = computed(() => results.value.filter((item) => item.status === "matched").length);
const judgedCount = computed(() => results.value.filter((item) => item.status !== "unknown").length);
const statusText = (status: PdfFieldResult["status"]) => ({
  matched: $t("pdfCheck_matched"), // 字段与当前简历一致。
  unclassified: $t("pdfCheck_unclassified"), // 字段文字存在但通用解析器未归类。
  missing: $t("pdfCheck_missing"), // PDF 文字层缺少当前字段。
  unknown: $t("pdfCheck_unknown"), // 脱敏字段不参与判断。
})[status];

// 两个入口都传入真实 PDF；源简历只在 PDF 解析完毕后用于对照。
const check = async (file: Blob, name: string, item: any) => {
  const version = ++runVersion;
  visible.value = true;
  loading.value = true;
  error.value = "";
  fileName.value = name;
  parsed.value = null;
  results.value = [];
  comparisonItem.value = item ? JSON.parse(JSON.stringify(item)) : null;
  try {
    const pdf = await parsePdfResume(file);
    if (version !== runVersion) return;
    parsed.value = pdf;
    results.value = compareCurrent.value && comparisonItem.value ? comparePdfResume(pdf, comparisonItem.value) : [];
  } catch (cause) {
    if (version === runVersion) error.value = cause instanceof Error ? cause.message : $t("pdfCheck_parseFailed");
  } finally {
    if (version === runVersion) loading.value = false;
  }
};

const chooseFile = () => fileInput.value?.click();
const open = () => { visible.value = true; };
const handleFile = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  void check(file, file.name, resumeStore.currentItem);
};
const handleCloudPdf = (payload: unknown) => {
  const file = payload as {
    blob: Blob; // 云端生成的最终 PDF 文件。
    fileName: string; // 下载文件名。
    item: unknown; // 导出时的简历快照，仅供事后对照。
  };
  compareCurrent.value = true;
  void check(file.blob, file.fileName, file.item);
};

watch(compareCurrent, () => {
  results.value = compareCurrent.value && parsed.value && comparisonItem.value
    ? comparePdfResume(parsed.value, comparisonItem.value)
    : [];
});

onMounted(() => eventBus.on("resume-pdf-check", handleCloudPdf));
onUnmounted(() => {
  runVersion += 1;
  eventBus.off("resume-pdf-check", handleCloudPdf);
});
defineExpose({ open });
</script>

<template>
  <input ref="fileInput" class="hidden" type="file" accept="application/pdf,.pdf" @change="handleFile" />
  <SfModal v-model="visible" :title="$t('pdfCheck_title')" width="720px">
    <div class="flex flex-col gap-3 text-sm text-sf-text">
      <p class="text-sf-text-2">{{ $t("pdfCheck_intro1") }}</p>
      <p class="text-sf-text-2">{{ $t("pdfCheck_intro2") }}</p>
      <div class="flex flex-wrap items-center gap-3">
        <SfButton type="bg" @click="chooseFile">{{ $t("pdfCheck_chooseFile") }}</SfButton>
        <span class="min-w-0 truncate text-sf-text-2">{{ fileName }}</span>
      </div>
      <label class="flex items-center gap-3"><input v-model="compareCurrent" type="checkbox" />{{ $t("pdfCheck_compareLabel") }}</label>
      <p v-if="loading">{{ $t("pdfCheck_loading") }}</p>
      <p v-else-if="error" class="text-sf-error">{{ error }}</p>
      <template v-else-if="parsed">
        <div class="rounded-xl border border-sf-b bg-sf-bg p-3">
          <p>{{ $t("pdfCheck_pagesInfo", { pages: parsed.pages, chars: parsed.text.length }) }}</p>
          <p v-if="!parsed.text.trim()" class="text-sf-error">{{ $t("pdfCheck_noTextLayer") }}</p>
          <p v-else>{{ $t("pdfCheck_independent", { name: parsed.name || $t("pdfCheck_unrecognized"), emails: parsed.emails.join($t("enumSeparator")) || $t("pdfCheck_unrecognized"), phones: parsed.phones.join($t("enumSeparator")) || $t("pdfCheck_unrecognized") }) }}</p>
        </div>
        <!-- 经历和教育仅展示 PDF 独立识别的片段，便于检查分类结果。 -->
        <details v-if="parsed.work || parsed.education" class="rounded-xl border border-sf-b p-3">
          <summary class="cursor-pointer">{{ $t("pdfCheck_viewExperience") }}</summary>
          <p v-if="parsed.work" class="mt-3 font-medium">{{ $t("workExperience") }}</p>
          <pre v-if="parsed.work" class="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{{ parsed.work }}</pre>
          <p v-if="parsed.education" class="mt-3 font-medium">{{ $t("educationExperience") }}</p>
          <pre v-if="parsed.education" class="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{{ parsed.education }}</pre>
        </details>
        <div v-if="results.length" class="flex flex-col gap-3">
          <p class="font-medium">{{ $t("pdfCheck_compareResult", { matched: matchedCount, judged: judgedCount }) }}</p>
          <div v-for="(field, index) in results" :key="`${field.label}-${index}`" class="flex flex-wrap items-start justify-between gap-3 border-b border-sf-b pb-3">
            <div class="min-w-0 flex-1">
              <p class="font-medium">{{ field.label }}：{{ field.expected }}</p>
              <p v-if="field.status !== 'matched' && field.actual" class="line-clamp-2 text-sf-text-2">{{ $t("pdfCheck_recognizedFragment", { text: field.actual }) }}</p>
            </div>
            <span :class="field.status === 'matched' ? 'text-sf-success' : field.status === 'missing' ? 'text-sf-error' : 'text-sf-text-2'">{{ statusText(field.status) }}</span>
          </div>
        </div>
        <p v-else-if="compareCurrent && !comparisonItem" class="text-sf-text-2">{{ $t("pdfCheck_noComparison") }}</p>
        <details class="rounded-xl border border-sf-b p-3">
          <summary class="cursor-pointer">{{ $t("pdfCheck_viewOriginal") }}</summary>
          <pre class="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs">{{ parsed.text || $t("pdfCheck_noExtractableText") }}</pre>
        </details>
      </template>
    </div>
  </SfModal>
</template>
