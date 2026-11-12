<script setup>
import { useAiStore } from "@/stores";

const aiStore = useAiStore();
const { thinkMode } = storeToRefs(aiStore);
</script>

<template>
  <div
    class="flex-c cursor-pointer gap-0.5 rounded-3xl border border-transparent px-2 py-1.5 text-[12px] font-semibold select-none"
    :class="
      thinkMode
        ? ' border-sf-theme! text-sf-theme'
        : 'text-sf-text-3 hover:bg-sf-bg-2 hover:text-sf-text'
    "
    @click.stop="thinkMode = !thinkMode"
  >
    {{ $t("aiChat_deepThink") }}
  </div>
</template>

<style lang="scss" scoped></style>
