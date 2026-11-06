<script setup>
// 小舟 AI 与编辑器弹窗复用同一份模型设置，绑定和添加状态保持一致。
import AiProviderSettingsContent from "../../editor/toolbar/modules/ai/content.vue";
</script>

<template>
  <!-- 路由外壳限制可用高度，内部内容禁止收缩，溢出统一交给滚动条。 -->
  <div class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-sf-page">
  <SfScrollbar class="min-h-0 flex-1" flush always>
    <main class="flex min-h-full w-full shrink-0 flex-col gap-3 p-3 text-sf-text">
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-sf-text">{{ $t("resumeNavAiSettings") }}</h1>
          <p class="mt-[6px] max-w-3xl text-xs leading-6 text-sf-text-2">
            {{ $t("resumeSettingsModelDescription") }}
          </p>
        </div>
      </header>
      <AiProviderSettingsContent class="shrink-0" />
    </main>
  </SfScrollbar>
  </div>
</template>
