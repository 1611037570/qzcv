<script setup>
// 编辑器更新日志提示：存在未读更新时，以右下角通知展示最新一条更新并自动关闭
import { computed, h, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { ElNotification } from "element-plus";
import changelog from "@/configs/modules/changelog";
import { useSystemStore } from "@/stores/modules/system";
import { $t } from "@/locales";

// 调试开关：true 时每次进入编辑器都强制提示且不写已读，便于反复验证展示与自动关闭；上线前改回 false
const DEBUG_FORCE_UPDATE_LOG = true;

const systemStore = useSystemStore();
const { lastReadLogId } = storeToRefs(systemStore);

// 展示最新一条更新
const latest = computed(() => changelog[0]);

// 是否存在未读更新：最新一条日志的 id 与已读记录不一致
const hasUnread = computed(() => latest.value && latest.value.id !== lastReadLogId.value);

// 通知自动关闭时长（6 秒）
const AUTO_HIDE_DELAY = 6000;

// 弹出更新日志通知
function showNotification() {
  ElNotification({
    title: `${latest.value.version} ${$t("updateLog")}`,
    message: h("div", { class: "flex flex-col gap-1" }, [
      h("span", { class: "text-xs tabular-nums" }, latest.value.date), // 发布日期
      // 一行一条变更描述
      ...latest.value.list.map((text) =>
        h("div", { class: "text-[13px] leading-6" }, text),
      ),
    ]),
    position: "bottom-right", // 右下角展示，不遮挡编辑区
    duration: AUTO_HIDE_DELAY, // 自动关闭，无需手动操作
    progress: true, // 显示自动关闭的时间倒计时进度条
    offset: 80, // 下移避开底部导航
  });
}

onMounted(() => {
  if (!latest.value) return;
  // 调试模式：跳过已读判断，每次进入都提示
  if (DEBUG_FORCE_UPDATE_LOG) {
    showNotification();
    return;
  }
  if (!hasUnread.value) return;
  // 展示即记为已读，本次提示后不再重复打扰
  lastReadLogId.value = latest.value.id;
  showNotification();
});
</script>
