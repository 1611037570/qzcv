<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useResumeStore } from "@/stores";
import CloudSyncModal from "@/views/resume/components/cloudSync/index.vue";

// 设备互传入口：把当前简历换成 6 位取件码，在另一台设备取回
const resumeStore = useResumeStore();
const { currentItem } = storeToRefs(resumeStore);
const visible = ref(false);
</script>

<template>
  <SfTooltip :content="$t('resumeCloudSyncMenu')">
    <!-- 尺寸与相邻顶栏入口保持一致 -->
    <button
      type="button"
      class="flex h-9 cursor-pointer items-center gap-1 rounded-3xl border border-sf-b bg-sf-page p-1 px-2 text-sm transition-colors hover:bg-sf-theme hover:text-white"
      :aria-label="$t('resumeCloudSyncMenu')"
      :aria-expanded="visible"
      @click="visible = true"
    >
      <SfIcon icon="lucide:cloud-upload" size="4" />
      <span class="hidden lg:inline">{{ $t("resumeCloudSyncMenu") }}</span>
    </button>
  </SfTooltip>
  <CloudSyncModal v-if="visible" v-model="visible" :item="currentItem" jump-after-receive />
</template>
