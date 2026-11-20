<script setup>
import { ref } from "vue";

// 闲鱼 1v1 简历优化下单地址，弹窗内渲染为二维码
const XIAN_YU_URL = "https://m.tb.cn/h.jlndDta?tk=AOT06UHeWna";

// 弹窗状态
const visible = ref(false);

// 服务清单：对标闲鱼简历优化服务标准配置，图标与文案均为固定卖点
const services = [
  {
    icon: "ph:stethoscope-duotone",
    title: "简历诊断",
    desc: "逐条指出排版、表达与岗位匹配上的硬伤",
  },
  {
    icon: "fa6-solid:pen",
    title: "经历重写",
    desc: "STAR 法则重写项目经历，把做过写成做成",
  },
  {
    icon: "fa6-solid:bullseye",
    title: "岗位匹配",
    desc: "对照目标岗位 JD 提炼关键词，提升过筛率",
  },
  {
    icon: "lucide:layout-template",
    title: "排版交付",
    desc: "一页纸结构统一，导出可直接投递的 PDF",
  },
];
</script>

<template>
  <!-- 1v1 简历优化广告位：渐变竖排横幅，hover 有柔光扫过 -->
  <button
    type="button"
    class="group relative flex w-12 cursor-pointer flex-col items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-b from-sf-theme to-sf-theme-2 py-3 text-sf-theme-text shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95"
    @click="visible = true"
  >
    <!-- 柔光扫过：hover 时一道高光自左向右掠过，增强广告位吸引力 -->
    <span
      class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white to-transparent opacity-25 transition-transform duration-700 group-hover:translate-x-full"
    ></span>
    <span class="relative text-base font-extrabold leading-5">1v1</span>
    <span class="relative flex flex-col items-center text-sm font-semibold leading-5">
      <span>简</span>
      <span>历</span>
      <span>优</span>
      <span>化</span>
    </span>
  </button>

  <SfModal v-model="visible" title="1v1简历优化" width="380px">
    <div class="flex flex-col gap-3">
      <!-- 顶部渐变海报：标题、价格徽章与一句话卖点 -->
      <div
        class="flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-sf-theme to-sf-theme-2 p-3 text-sf-theme-text"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="text-lg leading-6 font-bold">1v1 简历优化</span>
          <span class="rounded-full bg-sf-primary px-3 py-0.5 text-xs font-bold text-sf-theme">50R</span>
        </div>
        <p class="text-xs leading-5 opacity-90">作者本人逐句打磨，把经历讲成招聘方想看的亮点。</p>
      </div>

      <!-- 服务内容：两列卡片网格，标题加一句具体交付说明 -->
      <div class="flex flex-col gap-3 rounded-2xl border border-sf-b bg-sf-bg p-3">
        <p class="text-xs font-semibold text-sf-text-3">服务内容</p>
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
        <p class="text-xs leading-5 text-sf-text-3">
          流程：发我简历 + 目标岗位 → 初稿确认 → 定稿交付
        </p>
      </div>

      <!-- 扫码下单区：左侧白底二维码，右侧价格与引导文案 -->
      <div class="flex items-center gap-3">
        <div class="rounded-2xl border border-sf-b bg-white p-3">
          <div class="h-40 w-40">
            <SfQrcode :value="XIAN_YU_URL" :size="160" />
          </div>
        </div>
        <div class="flex flex-1 flex-col gap-3">
          <p class="text-base font-semibold text-sf-text">使用闲鱼扫码</p>
          <p class="text-sm leading-6 text-sf-text-2">
            <span class="text-xl font-bold text-sf-theme">50R</span>
            作者对接1v1优化
          </p>
        </div>
      </div>
    </div>
  </SfModal>
</template>
