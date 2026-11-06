<script setup>
import { computed, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useRoute } from "vue-router";
import ProjectTitle from "./projectTitle.vue";
import GithubStars from "./githubStars.vue";
import ResumeClosing from "./resumeClosing.vue";

const route = useRoute();
const drawerVisible = ref(false);
// 窄屏使用抽屉，桌面固定显示紧凑侧栏。
const isMobile = useMediaQuery("(max-width: 767px)");

// 桌面侧栏与移动抽屉共用分组：简历制作、AI 助手、设置与记录、求职工具、更多。
const navGroups = [
  {
    key: "resumeNavGroupResume", // 简历制作分组标题文案标识。
    items: [ // 简历制作功能入口。
      {
        key: "resumeNavTemplates", // 简历模板入口文案标识。
        path: "/resume/template", // 简历模板页面路径。
        icon: "lucide:layout-template", // 模板导航图标。
      },
      {
        key: "resumeNavMyResumes", // 我的简历入口文案标识。
        path: "/resume/mine", // 我的简历页面路径。
        icon: "mdi:file-document-outline", // 我的简历导航图标。
      },
    ],
  },
  {
    key: "resumeNavGroupAi", // AI 助手分组标题文案标识。
    items: [ // AI 助手功能入口。
      {
        key: "resumeNavAiGenerate", // 简历生成入口文案标识。
        path: "/resume/generate", // 独立简历生成页面路径。
        icon: "lucide:wand-sparkles", // 简历生成导航图标。
      },
      {
        key: "resumeNavAiOptimize", // 简历优化入口文案标识。
        path: "/resume/optimize", // 独立简历优化页面路径。
        icon: "lucide:scan-text", // 简历优化导航图标。
      },
      {
        key: "resumeNavJobMatch", // 岗位适配入口文案标识。
        path: "/resume/job-match", // 独立岗位适配页面路径。
        icon: "ph:crosshair-duotone", // 复用已有岗位图标。
      },
      {
        key: "resumeNavInterview", // 面试训练入口文案标识。
        path: "/resume/interview", // 独立面试训练页面路径。
        icon: "ph:microphone-duotone", // 面试训练导航图标。
      },
    ],
  },
  {
    key: "resumeNavGroupSettings", // 设置与记录分组标题文案标识。
    items: [ // 设置与记录功能入口。
      {
        key: "resumeNavAiUsage", // 使用情况入口文案标识。
        path: "/resume/ai-usage", // 个人使用情况页面路径。
        icon: "tabler:history", // 使用记录导航图标。
      },
      {
        key: "resumeNavAiSettings", // 模型设置入口文案标识。
        path: "/resume/ai", // 模型绑定与添加页面路径。
        icon: "lucide:sparkles", // 模型设置导航图标。
      },
      {
        key: "resumeNavSettings", // 通用设置入口文案标识。
        path: "/resume/settings", // 通用设置页面路径。
        icon: "lucide:sliders-horizontal", // 通用设置导航图标。
      },
    ],
  },
  {
    key: "resumeNavGroupResources", // 求职工具分组标题文案标识。
    items: [ // 求职工具功能入口。
      {
        key: "resumeNavStatistics", // 求职统计入口文案标识。
        path: "/resume/statistics", // 求职统计页面路径。
        icon: "fa-solid:chart-line", // 求职统计导航图标。
      },
      {
        key: "resumeNavGuide", // 求职指南入口文案标识。
        path: "/resume/guide", // 求职指南页面路径。
        icon: "mdi:book-open-page-variant", // 求职指南导航图标。
      },
      {
        key: "resumeNavTools", // 求职工具入口文案标识。
        path: "/resume/tools", // 求职工具页面路径。
        icon: "mdi:hammer-wrench", // 求职工具导航图标。
      },
    ],
  },
  {
    key: "resumeNavGroupMore", // 更多分组标题文案标识。
    items: [ // 更多功能入口。
      {
        key: "resumeNavLanded", // 歇会儿入口文案标识。
        path: "/resume/landed", // 歇会儿页面路径。
        icon: "mdi:trophy-outline", // 歇会儿导航图标。
      },
    ],
  },
];
// 展平分组后判断选中项，子页面沿用所属导航入口。
const navItems = computed(() => navGroups.flatMap((group) => group.items));
const activeNavPath = computed(() => {
  const currentPath = route.path.replace(/\/+$/, "");
  const matched = navItems.value.find((item) =>
    currentPath === item.path ||
    (item.path !== "/resume" && currentPath.startsWith(`${item.path}/`)),
  );
  return matched?.path ?? "";
});
const isActive = (item) => item.path === activeNavPath.value;

// 路由切换或恢复桌面宽度时收起移动导航。
watch([() => route.path, isMobile], () => {
  drawerVisible.value = false;
});
</script>

<template>
  <!-- 桌面侧栏宽度随内容撑开，导航滚动与底部功能区分开。 -->
  <aside class="relative z-50 hidden h-full w-fit shrink-0 flex-col border-r border-sf-b bg-sf-primary text-sf-text md:flex">
    <!-- 品牌区与顶部栏同高，标识在整条内居中，保留组件自带的圆角悬停底色。 -->
    <ProjectTitle
      class="flex h-12 shrink-0 items-center justify-center border-b border-sf-b px-3 [&_.animate-pulse]:animate-none [&_a]:gap-3 [&_a>span]:text-xl [&_a>span]:font-semibold [&_a>span]:tracking-normal"
      :logo-size="6"
      url="/resume"
    />
    <!-- 导航复用滚动条横向间距，分组标题与上下条目保持一致间距。 -->
    <SfScrollbar class="min-h-0 flex-1">
    <nav class="flex flex-col py-3" :aria-label="$t('resumeNavTitle')">
      <div
        v-for="group in navGroups"
        :key="group.key || group.items[0].path"
        class="flex flex-col gap-[3px] [&+div]:pt-[3px]"
      >
        <p v-if="group.key" class="px-3 text-xs font-medium text-sf-text-3">{{ $t(group.key) }}</p>
        <router-link
          v-for="item in group.items"
          :key="item.path"
          :to="item.path"
          class="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-sf-theme"
          :class="isActive(item) ? 'bg-sf-bg font-medium text-sf-text' : 'text-sf-text-2 hover:bg-sf-bg hover:text-sf-text'"
          :aria-current="isActive(item) ? 'page' : undefined"
        >
          <!-- 图标与文字保持小于品牌区，条目靠左排列，仅品牌标识居中。 -->
          <SfIcon :icon="item.icon" size="4" box-size="5" class="shrink-0 text-inherit!" />
          <span class="min-w-0 break-words">{{ $t(item.key) }}</span>
        </router-link>
      </div>
    </nav>
    </SfScrollbar>
    <!-- 完整交互区域继续由图标盒子承接，功能按钮统一放在侧栏底部，由两端对齐分配间距。 -->
    <footer class="flex shrink-0 items-center justify-between border-t border-sf-b p-3">
      <GithubStars size="5" :box-size="9" class="rounded-lg" />
      <SfTheme size="5" :box-size="9" class="flex h-9 w-9 items-center justify-center" />
      <SfLocale size="5" :box-size="9" class="flex h-9 w-9 items-center justify-center" />
      <SfDonation size="5" :box-size="9" class="h-9 w-9 cursor-pointer justify-center" />
    </footer>
    <!-- 寄语置于侧栏最底部，与编辑器模块栏共用组件。 -->
    <ResumeClosing class="shrink-0 px-3 pb-3" />
  </aside>

  <!-- 移动端仅保留导航入口和品牌，功能按钮随抽屉移至底部。 -->
  <header class="fixed inset-x-0 top-0 z-50 flex h-12 items-center gap-3 border-b border-sf-b bg-sf-primary px-3 text-sf-text md:hidden">
    <button
      type="button"
      class="flex h-9 w-9 shrink-0 cursor-pointer flex-col items-center justify-center gap-[6px] rounded-md text-sf-text-2 transition-colors hover:bg-sf-bg hover:text-sf-text"
      :aria-label="$t('resumeNavOpen')"
      :aria-expanded="drawerVisible"
      @click="drawerVisible = true"
    >
      <span class="h-px w-[18px] rounded-full bg-current"></span>
      <span class="h-px w-[18px] rounded-full bg-current"></span>
      <span class="h-px w-[18px] rounded-full bg-current"></span>
    </button>
    <ProjectTitle class="flex [&_.animate-pulse]:animate-none [&_a]:gap-3 [&_a]:px-0 [&_a>span]:flex" url="/resume" />
  </header>

  <el-drawer
    v-model="drawerVisible"
    :title="$t('resumeNavTitle')"
    direction="ltr"
    size="min(80vw, 216px)"
    :body-class="'overflow-hidden! p-0!'"
    :header-class="'m-0! p-3!'"
    :footer-class="'border-t border-sf-b p-3!'"
    append-to-body
    destroy-on-close
  >
    <!-- 移动导航同步保持分组标题上下间距一致。 -->
    <SfScrollbar class="min-h-0">
    <nav class="flex flex-col py-3 text-sf-text">
      <div
        v-for="group in navGroups"
        :key="group.key || group.items[0].path"
        class="flex flex-col gap-[6px] [&+div]:pt-[6px]"
      >
        <p v-if="group.key" class="px-3 text-xs font-medium text-sf-text-3">{{ $t(group.key) }}</p>
        <router-link
          v-for="item in group.items"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 rounded-lg p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-sf-theme"
          :class="isActive(item) ? 'bg-sf-bg font-medium text-sf-text' : 'text-sf-text-2 hover:bg-sf-bg hover:text-sf-text'"
          :aria-current="isActive(item) ? 'page' : undefined"
          @click="drawerVisible = false"
        >
          <SfIcon :icon="item.icon" size="5" box-size="6" class="shrink-0 text-inherit!" />
          <span class="min-w-0 break-words">{{ $t(item.key) }}</span>
        </router-link>
      </div>
    </nav>
    </SfScrollbar>
    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <GithubStars size="5" :box-size="9" class="rounded-lg" />
        <SfTheme size="5" :box-size="9" class="flex h-9 w-9 items-center justify-center" />
        <SfLocale size="5" :box-size="9" class="flex h-9 w-9 items-center justify-center" />
        <SfDonation size="5" :box-size="9" class="h-9 w-9 cursor-pointer justify-center" />
      </div>
      <ResumeClosing class="pt-3" />
    </template>
  </el-drawer>
</template>
