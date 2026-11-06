<script setup lang="ts">
import { useResumeStore } from "@/stores";
import { useResumeCapacity } from "../../hooks/useResumeCapacity";

const store = useResumeStore();
const { remainingSlots } = useResumeCapacity();
</script>

<template>
  <!-- 有容量时不占界面，只有已满才提示并提供管理入口。 -->
  <div v-if="!remainingSlots" class="flex shrink-0 flex-wrap items-center gap-3 rounded-xl bg-sf-warning-2 p-3 text-xs leading-6 text-sf-warning" role="status">
    <span class="min-w-0 flex-1">{{ $t('resumeCreateMaxLimit', { max: store.maxCount }) }}</span>
    <router-link to="/resume/mine" class="shrink-0 font-medium hover:underline">{{ $t('resumeSlotsManage') }}</router-link>
  </div>
</template>
