<script setup>
import { getResumeJobField } from "@snowflake/resume-core";
// 求职方向跟随独立模块或个人信息的实际数据。
import { normalizeResumeTags } from "@/domain/resume/resumeTags";
import ResumeTagsModal from "../components/resumeTagsModal.vue";
import { compactResumeItem } from "@/domain/resume/theme/resumeUi";
import { useResumeStore } from "@/stores";
import { trackResumeAction } from "@/hooks";
import { $t } from "@/locales";
import dayjs from "dayjs";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useProgress } from "../editor/hooks/useProgress";
import { useResumeName } from "../hooks/useResumeName";
import { expandConfigModules } from "@/stores/modules/resume/hooks/useConfigTemplate";
import ResumeCardContainer from "./components/resumeCardContainer.vue";
import RevealGrid from "../components/revealGrid.vue";
import ImportResume from "./components/importResume.vue";
import SendResume from "@/views/resume/components/sendResume/index.vue";
import RenameResumeModal from "../components/renameResumeModal.vue";
import CreateResume from "./components/createResume.vue";
import { ElNotification } from "element-plus";
// 草稿预览复用模板页专用全屏预览组件，保持两处预览布局一致。
const TemplatePreview = markRaw(
  defineAsyncComponent(() => import("../template/templatePreview.vue")),
);

const router = useRouter();

const resumeStore = useResumeStore();
const { resumeList: list, currentIndex } = storeToRefs(resumeStore);
const { maxCount } = resumeStore;
const { getExportFileName, getResumeTitle } = useResumeName();
const { proxy } = getCurrentInstance();

// 每次进入简历页：清理回收站中超过保留天数的简历
onMounted(() => {
  resumeStore.cleanExpiredTrash();
});

const sortedList = computed(() => {
  return [...list.value].sort(
    (a, b) => (b?.usage?.lastUseTime || 0) - (a?.usage?.lastUseTime || 0),
  );
});
const displayList = computed(() => {
  // id → 真实下标映射：列表按 lastUseTime 排序后仍能定位真实下标
  const indexMap = new Map(list.value.map((item, index) => [item.id, index]));
  const cards = sortedList.value.map((item) => ({
    id: item.id,
    type: "resume",
    item,
    index: indexMap.get(item.id) ?? -1,
    progress: useProgress(
      expandConfigModules(item.config?.modules || [], item.data),
      item.data,
      item.ui,
    ).progress,
  }));
  // 未满员时新建入口作首项，与简历项一同逐个揭示
  return list.value.length < maxCount ? [{ id: "__create", type: "create" }, ...cards] : cards;
});
const getLastUseTime = (item) => {
  return item?.usage?.lastUseTime ? dayjs(item.usage.lastUseTime).format("YYYY.MM.DD HH:mm") : "--";
};
const getResumePosition = (item) => {
  return getResumeJobField(item?.data, "position") || $t("resumeMinePositionEmpty");
};
// 岗位为空时用中性样式展示占位文案，避免和真实岗位的标签混淆
const hasResumePosition = (item) => Boolean(getResumeJobField(item?.data, "position"));

// 导出指定简历的完整 JSON 配置，支持后续无损导入恢复。
const exportJson = (item) => {
  const json = JSON.stringify(compactResumeItem(item) ?? {}, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getExportFileName(getResumeTitle(item), "json");
  link.click();
  URL.revokeObjectURL(url);
  // 导出完成后上报一次埋点
  trackResumeAction({ eventType: "export", fileType: "json", source: "local" });
};

// 草稿预览：记录当前打开的简历项，visible 由其是否存在派生。
const previewItem = ref(null);
const isPreviewVisible = computed(() => !!previewItem.value);
const openPreview = (item) => {
  previewItem.value = item;
};
const closePreview = () => {
  previewItem.value = null;
};

// 更多菜单记录待重命名的草稿，交给编辑器共用弹窗处理。
const renameItem = ref(null);
const renameVisible = ref(false);
const openRename = (item) => {
  renameItem.value = item;
  renameVisible.value = true;
};

// 标签编辑固定目标简历，右键与更多菜单复用同一入口。
const tagsItem = ref(null);
const tagsVisible = ref(false);
const getResumeTags = (item) => normalizeResumeTags(item?.usage?.tags);
const openTags = (item) => {
  tagsItem.value = item;
  tagsVisible.value = true;
};
const getTagActionList = (item) => [{
  name: $t("resumeMineEditTags"), // 标签修改入口名称。
  icon: "lucide:tag", // 已登记的标签图标。
  fn: () => openTags(item), // 打开目标简历的标签弹窗。
}];

// 复制指定简历：复用 store 深拷贝逻辑创建独立新简历，并提示复制结果。
const copyResume = (item) => {
  const copiedId = resumeStore.duplicateResume(item);
  if (!copiedId) return;
  ElNotification({
    title: $t("resumeMineCopySuccess"),
    message: $t("resumeMineCopySuccessMessage"),
    position: "top-right",
    offset: 40,
  });
};

// 草稿卡片操作菜单。
const getActionList = (item) => [
  ...getTagActionList(item),
  {
    name: $t("resumeMineRename"), // 草稿操作名称
    icon: "lucide:pencil-line", // 重命名入口图标
    fn: () => openRename(item), // 打开共用重命名弹窗
  },
  {
    name: $t("resumeMineCopy"),
    icon: "lucide:copy",
    fn: () => copyResume(item),
  },
  {
    name: $t("resumeMineExportJson"),
    icon: "fa6-solid:file-export",
    fn: () => exportJson(item),
  },
  {
    name: $t("resumeMinePreview"),
    icon: "lucide:eye",
    fn: () => openPreview(item),
  },
];

// 回收站弹窗：首次打开时才加载回收站正文，避免一进页面就读取已删除简历
const trashVisible = ref(false);
const trashReady = ref(false);
const trashLoading = ref(false);
const trashLoadError = ref(false);
const trashAction = ref("");
const trashCount = computed(() => resumeStore.list.filter((item) => item.deletedAt !== null).length);
const openTrash = async () => {
  trashVisible.value = true;
  if (trashLoading.value) return;
  // 每次打开明确标记读取状态，失败后允许重新加载。
  trashLoading.value = true;
  trashLoadError.value = false;
  try {
    await resumeStore.loadTrashResumes();
    trashReady.value = true;
  } catch {
    trashLoadError.value = true;
  } finally { trashLoading.value = false; }
};
// 页头按钮恢复原有胶囊外观与主题色悬停反馈。
const entryButtonClass =
  "flex h-9 cursor-pointer items-center gap-1 rounded-3xl border border-sf-b bg-sf-primary p-1 px-2 text-sm transition-colors hover:bg-sf-theme hover:text-white";

// 按真实下标定位简历（displayList 中已携带 index）
const handleEdit = (index) => {
  if (index === -1) return;
  currentIndex.value = index;
  router.push({ path: "/resume/editor", query: { id: list.value[index].id } });
};

// 从预览返回对应草稿的编辑器。
const editPreview = () => {
  const index = list.value.findIndex((item) => item.id === previewItem.value?.id);
  closePreview();
  handleEdit(index);
};

const handleDelete = (index) => {
  proxy.$confirm($t("resumeMineDeleteConfirm"), $t("resumeMineDeleteConfirmTitle")).then(() => {
    if (index === -1) return;
    currentIndex.value = index;
    resumeStore.deleteResume();
  });
};

// 清空前二次确认，避免误删回收站内容。
const handleClearTrash = () => {
  if (!resumeStore.trashList.length || trashAction.value) return;
  proxy.$confirm($t("resumeMineClearTrashConfirm"), $t("resumeMineClearTrashConfirmTitle")).then(async () => {
    if (trashAction.value) return;
    // 清空期间显示进度并阻止重复操作，结束后恢复按钮。
    trashAction.value = "clear";
    try { await resumeStore.clearTrash(); }
    catch { ElNotification({ type: "error", message: $t("resumeMineTrashActionFailed") }); }
    finally { trashAction.value = ""; }
  });
};
// 永久删除展示对应条目的进行中状态，避免无反馈的重复点击。
const handlePermanentDelete = async (index) => {
  if (trashAction.value) return;
  trashAction.value = resumeStore.trashList[index]?.id || "";
  if (!trashAction.value) return;
  try { await resumeStore.permanentlyDeleteResume(index); }
  catch { ElNotification({ type: "error", message: $t("resumeMineTrashActionFailed") }); }
  finally { trashAction.value = ""; }
};
</script>

<template>
  <div class="relative flex h-full w-full flex-col">
    <!-- 页头直接展示操作，自身内边距承担列表间距，避免额外间隙叠加。 -->
    <header class="flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <h1 class="text-lg font-semibold text-sf-text">{{ $t("resumeNavMyResumes") }}</h1>
        <!-- 草稿数量使用主文字色，保证深色背景下的对比度。 -->
        <span class="border-l border-sf-b pl-3 text-sm text-sf-text">{{ $t("resumeMineDraftsCount", { current: list.length, max: maxCount }) }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <ImportResume>
          <template #trigger="{ open }">
            <button type="button" :class="entryButtonClass" @click="open">
              <SfIcon icon="fa6-solid:file-import" size="4" />
              <span>{{ $t("resumeImportResume") }}</span>
            </button>
          </template>
        </ImportResume>
        <SendResume>
          <button type="button" :class="entryButtonClass">
            <SfIcon icon="ph:paper-plane-right-fill" size="4" class="rotate-180" />
            <span>{{ $t("resumeSendResume") }}</span>
          </button>
        </SendResume>
        <button type="button" :class="entryButtonClass" @click="openTrash">
          <SfIcon icon="lucide:trash-2" size="4" />
          <span>{{ $t("resumeMineTrash") }}</span>
          <span class="tabular-nums">{{ trashCount }}</span>
        </button>
      </div>
    </header>
    <SfScrollbar class="flex-1" flush>
      <div class="flex h-full flex-col px-3 py-1">
        <!-- 简历草稿列表 -->
        <RevealGrid :items="displayList" key-field="id" :reveal="false">
          <template #default="{ item: card }">
            <!-- 新建简历入口项 -->
            <CreateResume v-if="card.type === 'create'" />
            <!-- 简历项 -->
            <!-- 卡片右键提供标签操作，移动端仍通过更多菜单进入。 -->
            <SfMenu v-else :list="getTagActionList(card.item)">
            <ResumeCardContainer :item="card.item" @click="handleEdit(card.index)">
              <template #actions>
                <SfDropdown trigger="click" placement="bottom-end" :show-arrow="false">
                  <SfIcon
                    icon="mdi:dots-horizontal"
                    size="5"
                    boxSize="8"
                    class="cursor-pointer rounded-full border border-sf-b bg-sf-primary text-sf-text-2 shadow-sm hover:bg-sf-theme-2 hover:text-sf-theme"
                  />
                  <template #dropdown>
                    <SfList :list="getActionList(card.item)" class="w-36" />
                  </template>
                </SfDropdown>
              </template>
              <!-- 标签保留原有位置，使用主题底色区分辅助信息。 -->
              <div v-if="getResumeTags(card.item).length" class="mb-[6px] flex min-w-0 items-center gap-[6px] text-[11px] leading-[18px] text-sf-text-2">
                <!-- 图标向下微调，补偿中文字形与行盒中心的视觉偏差。 -->
                <SfIcon icon="lucide:tag" size="3" class="relative top-px shrink-0" />
                <template v-for="(tag, tagIndex) in getResumeTags(card.item).slice(0, 3)" :key="tag">
                  <span v-if="tagIndex" aria-hidden="true" class="shrink-0 text-sf-text-3">·</span>
                  <span class="min-w-0 truncate rounded-full border border-sf-b bg-sf-bg px-[6px]">{{ tag }}</span>
                </template>
                <button v-if="getResumeTags(card.item).length > 3" type="button" class="shrink-0 cursor-pointer rounded-full border border-sf-b px-[6px] transition-colors hover:border-sf-theme hover:text-sf-theme" :aria-label="$t('resumeMineEditTags')" @click.stop="openTags(card.item)">+{{ getResumeTags(card.item).length - 3 }}</button>
              </div>
              <!-- 标题行：左侧圆环展示必填项完成度，与编辑器进度环同一套画法 -->
              <div class="flex items-center gap-2">
                <span
                  class="relative flex h-7 w-7 shrink-0 items-center justify-center"
                  role="img"
                  :aria-label="`${$t('resumeMineProgress')} ${card.progress}%`"
                >
                  <svg class="absolute inset-0 h-7 w-7 -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
                    <circle
                      cx="24"
                      cy="24"
                      r="19"
                      fill="none"
                      stroke="currentColor"
                      class="text-sf-bg-2"
                      stroke-width="6"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="19"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="6"
                      stroke-linecap="round"
                      stroke-dasharray="119.38"
                      :class="card.progress >= 100 ? 'text-sf-success' : 'text-sf-theme'"
                      :stroke-dashoffset="119.38 - (119.38 * card.progress) / 100"
                    />
                  </svg>
                  <span
                    class="text-[10px]"
                    :class="card.progress >= 100 ? 'text-sf-success' : 'text-sf-text'"
                  >
                    {{ card.progress }}
                  </span>
                </span>
                <div class="min-w-0 truncate text-sm font-semibold text-sf-text">
                  {{ getResumeTitle(card.item) }}
                </div>
              </div>
              <div class="mt-1 flex items-center justify-between gap-3">
                <span
                  class="min-w-0 truncate rounded-full px-3 py-1 text-xs font-medium"
                  :class="
                    hasResumePosition(card.item)
                      ? 'bg-sf-theme-3 text-sf-theme'
                      : 'bg-sf-bg text-sf-text-3'
                  "
                >
                  {{ getResumePosition(card.item) }}
                </span>
                <span class="shrink-0 text-xs text-sf-text-3">{{ getLastUseTime(card.item) }}</span>
              </div>
              <!-- 底部操作条：整条贴住卡片底边，格子等宽、格间用竖线分隔 -->
              <div class="-mx-2 -mb-2 mt-2 flex border-t border-sf-b">
                <button
                  type="button"
                  class="flex flex-1 cursor-pointer items-center justify-center gap-2 py-2 text-xs font-medium text-sf-text-2 transition-colors hover:bg-sf-bg hover:text-sf-theme"
                  @click.stop="handleEdit(card.index)"
                >
                  <SfIcon icon="lucide:pencil" size="4" />
                  {{ $t("resumeMineEdit") }}
                </button>
                <button
                  type="button"
                  class="flex flex-1 cursor-pointer items-center justify-center gap-2 border-l border-sf-b py-2 text-xs font-medium text-sf-text-2 transition-colors hover:bg-sf-bg hover:text-sf-theme"
                  @click.stop="copyResume(card.item)"
                >
                  <SfIcon icon="lucide:copy" size="4" />
                  {{ $t("resumeMineCopy") }}
                </button>
                <button
                  type="button"
                  class="flex flex-1 cursor-pointer items-center justify-center gap-2 border-l border-sf-b py-2 text-xs font-medium text-sf-text-2 transition-colors hover:bg-sf-error-2 hover:text-sf-error"
                  @click.stop="handleDelete(card.index)"
                >
                  <SfIcon icon="lucide:trash-2" size="4" />
                  {{ $t("resumeMineDelete") }}
                </button>
              </div>
            </ResumeCardContainer>
            </SfMenu>
          </template>
        </RevealGrid>
      </div>
    </SfScrollbar>
    <!-- 草稿专用全屏预览：复用模板页预览布局。 -->
    <TemplatePreview
      :visible="isPreviewVisible"
      :item="previewItem || {}"
      :title="getResumeTitle(previewItem)"
      :eyebrow-text="$t('resumeNavMyResumes')"
      :primary-action-text="$t('resumeMineEditResume')"
      :secondary-action-text="$t('resumeMineBackToMine')"
      @close="closePreview"
      @action="editPreview"
    />
    <!-- 回收站弹窗：只列名称与状态，不渲染简历缩略图 -->
    <SfModal v-model="trashVisible" :title="$t('resumeMineTrash')" width="600px">
      <!-- 约束内容高度，列表独立滚动，底部清空操作始终可见。 -->
      <div class="flex h-[min(480px,calc(90dvh-84px))] min-h-0 w-full flex-col gap-3">
        <SfScrollbar flush always class="min-h-0 flex-1" :aria-busy="trashLoading || !!trashAction">
        <div v-if="trashLoading" role="status" class="flex min-h-full flex-1 flex-col items-center justify-center gap-3 py-3 text-sf-text-2">
          <SfIcon icon="line-md:loading-twotone-loop" size="6" class="animate-spin text-sf-theme" />
          <span class="text-sm">{{ $t("resumeMineTrashLoading") }}</span>
        </div>
        <div v-else-if="trashLoadError" role="alert" class="flex min-h-full flex-1 flex-col items-center justify-center gap-3 py-3 text-sm text-sf-text-2">
          <span>{{ $t("resumeMineTrashLoadFailed") }}</span>
          <SfButton type="bg" @click="openTrash">{{ $t("resumeMineTrashRetry") }}</SfButton>
        </div>
        <div v-else-if="trashReady && resumeStore.trashList.length > 0" class="flex shrink-0 flex-col gap-3">
          <div
            v-for="(item, index) in resumeStore.trashList"
            :key="item.id"
            class="flex flex-wrap items-center gap-3 rounded-3xl border border-sf-b p-3 transition-colors hover:border-sf-theme"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="truncate text-sm font-bold text-sf-text">
                {{ getResumeTitle(item) }}
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="truncate rounded-full px-2 py-0.5 text-xs"
                  :class="
                    hasResumePosition(item)
                      ? 'bg-sf-theme-3 text-sf-theme'
                      : 'bg-sf-bg text-sf-text-3'
                  "
                >
                  {{ getResumePosition(item) }}
                </span>
                <span class="text-xs text-sf-text-3">
                  {{ $t("resumeMineTrashAutoClean", { days: resumeStore.getTrashRemainingDays(item) }) }}
                </span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1 rounded-xl px-3 py-1 text-sm text-sf-text-2 transition-colors hover:bg-sf-bg hover:text-sf-text"
                :disabled="!!trashAction"
                @click="resumeStore.restoreResume(index)"
              >
                <SfIcon icon="lucide:rotate-ccw" size="4" />
                {{ $t("resumeMineRestore") }}
              </button>
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1 rounded-xl px-3 py-1 text-sm text-sf-error transition-colors hover:bg-sf-error-2"
                :disabled="!!trashAction"
                @click="handlePermanentDelete(index)"
              >
                <SfIcon v-if="trashAction === item.id" icon="line-md:loading-twotone-loop" size="4" class="animate-spin" />
                <SfIcon v-else icon="lucide:trash-2" size="4" />
                {{ $t("resumeMinePermanentDelete") }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="flex min-h-full flex-1 flex-col items-center justify-center gap-3 py-3 text-sf-text-2">
          <SfIcon icon="lucide:trash-2" size="12" class="text-sf-text-3" />
          <span class="text-base">{{ $t("resumeMineTrashEmpty") }}</span>
        </div>
        </SfScrollbar>
        <div
          v-if="!trashLoading && !trashLoadError && trashReady && (resumeStore.trashList.length > 0 || trashAction === 'clear')"
          class="flex shrink-0 justify-end border-t border-sf-b pt-3"
        >
          <SfButton plain type="error" :disabled="!!trashAction" @click="handleClearTrash">
            <SfIcon v-if="trashAction === 'clear'" icon="line-md:loading-twotone-loop" size="4" class="mr-3 animate-spin" />
            <SfIcon v-else icon="lucide:trash-2" size="4" class="mr-3" />
            {{ $t(trashAction === 'clear' ? "resumeMineTrashClearing" : "resumeMineClearAll") }}
          </SfButton>
        </div>
      </div>
    </SfModal>
    <ResumeTagsModal v-model="tagsVisible" :item="tagsItem" />
    <RenameResumeModal v-model="renameVisible" :item="renameItem" />
  </div>
</template>

<style lang="scss" scoped></style>
