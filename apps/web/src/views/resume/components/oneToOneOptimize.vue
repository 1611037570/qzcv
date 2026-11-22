<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

// 服务广告文案随语言切换实时更新
const { t } = useI18n();

// 闲鱼 1v1 简历优化下单地址，弹窗内渲染为二维码
const XIAN_YU_URL = "https://m.tb.cn/h.jlndDta?tk=AOT06UHeWna";

// 展示形态：banner 为编辑器右侧竖排广告位，card 为页面内的横向入口
defineProps({
  /** 展示形态，取值 banner / card */
  variant: { type: String, default: "banner" },
});

// 弹窗状态
const visible = ref(false);

// 竖排广告位文案：按行拆分，中文逐字竖排、英文按词换行
const bannerLabel = computed(() => t("resumeOneToOneBannerLabel"));

// 服务清单：对标闲鱼简历优化服务标准配置，图标固定，文案走国际化
const services = computed(() => [
  {
    icon: "ph:stethoscope-duotone",
    title: t("resumeOneToOneServiceDiagnosisTitle"),
    desc: t("resumeOneToOneServiceDiagnosisDesc"),
  },
  {
    icon: "fa6-solid:pen",
    title: t("resumeOneToOneServiceRewriteTitle"),
    desc: t("resumeOneToOneServiceRewriteDesc"),
  },
  {
    icon: "fa6-solid:bullseye",
    title: t("resumeOneToOneServiceMatchTitle"),
    desc: t("resumeOneToOneServiceMatchDesc"),
  },
  {
    icon: "lucide:layout-template",
    title: t("resumeOneToOneServiceLayoutTitle"),
    desc: t("resumeOneToOneServiceLayoutDesc"),
  },
]);
</script>

<template>
  <!-- 竖排广告位：编辑器右侧工具轨下方使用 -->
  <button
    v-if="variant === 'banner'"
    type="button"
    class="group relative flex w-12 cursor-pointer flex-col items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-b from-sf-theme to-sf-theme-2 py-3 text-sf-theme-text shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95"
    @click="visible = true"
  >
    <!-- 柔光扫过：hover 时一道高光自左向右掠过，增强广告位吸引力 -->
    <span
      class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white to-transparent opacity-25 transition-transform duration-700 group-hover:translate-x-full"
    ></span>
    <span class="relative text-base font-extrabold leading-5">1v1</span>
    <span class="relative whitespace-pre-line text-center text-sm font-semibold leading-5">{{ bannerLabel }}</span>
  </button>

  <!-- 横向入口：页面内与按钮同高使用 -->
  <button
    v-else
    type="button"
    class="group relative flex h-9 cursor-pointer items-center overflow-hidden rounded-3xl bg-gradient-to-r from-sf-theme to-sf-theme-2 px-3 text-sm text-sf-theme-text shadow-sm transition-all duration-300 hover:shadow-md active:scale-95"
    @click="visible = true"
  >
    <!-- 柔光扫过：hover 时一道高光自左向右掠过，与竖排形态保持一致 -->
    <span
      class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white to-transparent opacity-25 transition-transform duration-700 group-hover:translate-x-full"
    ></span>
    <span class="relative font-extrabold">1v1</span>
    <span class="relative font-semibold">{{ t("resumeOneToOneLabel") }}</span>
  </button>

  <SfModal v-model="visible" :title="t('resumeOneToOneTitle')" width="380px">
    <div class="flex flex-col gap-3">
      <!-- 顶部渐变海报：标题、价格徽章与一句话卖点 -->
      <div
        class="flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-sf-theme to-sf-theme-2 p-3 text-sf-theme-text"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-lg leading-6 font-bold">{{ t("resumeOneToOneTitle") }}</span>
          <span class="rounded-full bg-sf-primary px-3 py-0.5 text-xs font-bold text-sf-theme">50R</span>
        </div>
        <p class="text-xs leading-5 opacity-90">{{ t("resumeOneToOnePosterDesc") }}</p>
      </div>

      <!-- 服务内容：两列卡片网格，标题加一句具体交付说明 -->
      <div class="flex flex-col gap-3 rounded-2xl border border-sf-b bg-sf-bg p-3">
        <p class="text-xs font-semibold text-sf-text-3">{{ t("resumeOneToOneServicesTitle") }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="item in services"
            :key="item.title"
            class="flex flex-col gap-3 rounded-xl border border-sf-b bg-sf-primary p-3"
          >
            <div class="flex items-center gap-3">
              <SfIcon :icon="item.icon" size="4" class="shrink-0 text-sf-theme" />
              <span class="text-sm font-semibold text-sf-text">{{ item.title }}</span>
            </div>
            <p class="text-xs leading-5 text-sf-text-3">{{ item.desc }}</p>
          </div>
        </div>
        <!-- 服务流程：说明下单后需要提供什么，降低沟通成本 -->
        <p class="text-xs leading-5 text-sf-text-3">{{ t("resumeOneToOneFlow") }}</p>
      </div>

      <!-- 扫码下单区：左侧白底二维码，右侧价格与引导文案 -->
      <div class="flex items-center gap-3">
        <div class="rounded-2xl border border-sf-b bg-white p-3">
          <div class="h-40 w-40">
            <SfQrcode :value="XIAN_YU_URL" :size="160" />
          </div>
        </div>
        <div class="flex flex-1 flex-col gap-3">
          <p class="text-base font-semibold text-sf-text">{{ t("resumeOneToOneScan") }}</p>
          <p class="text-sm leading-6 text-sf-text-2">
            <span class="text-xl font-bold text-sf-theme">50R</span>
            {{ t("resumeOneToOneAuthor") }}
          </p>
        </div>
      </div>
    </div>
  </SfModal>
</template>
