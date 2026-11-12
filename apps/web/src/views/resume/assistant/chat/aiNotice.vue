<script setup>
import { ref } from "vue";

const visible = ref(false);
</script>

<template>
  <div class="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-sf-text-3 select-none">
    <SfIcon icon="ph:info-duotone" size="3" />
    {{ $t("aiChat_poweredByPrefix") }}
    <button
      type="button"
      class="flex cursor-pointer items-center transition-colors hover:text-sf-theme"
      @click="visible = true"
    >
      「{{ $t("core.router.resumeAI") }}」
    </button>
    <span>{{ $t("aiChat_generatedDisclaimer") }}</span>

      <SfModal v-model="visible" :title="$t('core.router.resumeAI')">
      <div class="flex w-[350px] flex-col">
        <!-- AI宣传语 -->
        <div class="flex-c mb-3 text-base">
          {{ $t("core.router.resumeAIDesc") }}
        </div>
        <!-- ai介绍 -->
        <div class="text-sf-text" style="display: ruby">
          {{ $t("aiChat_customizedPrefix") }}
          <span class="font-semibold text-sf-theme">{{ $t("core.router.resume") }}</span>
          {{ $t("aiChat_customizedSuffix") }}
        </div>
      </div>
    </SfModal>
  </div>
</template>
