<script setup lang="ts">
import { storeToRefs } from "pinia";
import Icon from "../../components/icon.vue";
import ProviderSettingsContent from "./content.vue";
import { useAiStore } from "@/stores";

const aiStore = useAiStore();
const { modelManagerVisible, modelManagerTab } = storeToRefs(aiStore);

// 打开弹窗：重置到第一个 Tab
function openDrawer() {
  modelManagerTab.value = "added";
  modelManagerVisible.value = true;
}
</script>

<template>
  <div class="cursor-pointer text-sf-text hover:text-sf-theme" @click="openDrawer">
    <Icon :content="$t('aiModel_settings')" icon="lucide:sparkles" :active="modelManagerVisible" />
  </div>
  <!-- 设置弹窗承载角色清单与模型接入配置，统一限制内容高度。 -->
  <SfModal v-model="modelManagerVisible" :title="$t('aiModel_settings')" width="840px" bg-class="bg-sf-bg">
    <!-- 由统一滚动条承载设置内容，外壳负责留白，不重复增加横向间距。 -->
    <div class="h-[min(660px,calc(90svh-84px))] overflow-hidden">
      <SfScrollbar flush>
        <ProviderSettingsContent />
      </SfScrollbar>
    </div>
  </SfModal>
</template>

<style lang="scss" scoped></style>
