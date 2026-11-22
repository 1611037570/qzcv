<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  createBillingOrder,
  getBillingCatalog,
  getBillingWallet,
  simulateBillingPayment,
  type BillingCatalog,
  type BillingOrderResult,
  type BillingPackage,
  type BillingWallet,
} from "@/apis/billing";
import { groupLicenseKey, readLicenseKey, saveLicenseKey } from "@/apis/billing/license";
import { getLlmServiceStatus, type LlmServiceStatus } from "@/apis/llm/serviceStatus";
import { $t } from "@/locales";

// 余额、套餐、服务状态各自独立请求：任何一块失败都不该把另外两块拖下水
const wallet = ref<BillingWallet | null>(null);
const walletLoading = ref(true);
const walletError = ref("");
const walletRetrying = ref(false);

const catalog = ref<BillingCatalog | null>(null);
const catalogLoading = ref(true);
const catalogError = ref("");
const catalogRetrying = ref(false);

// 上游状态：读取失败只影响状态胶囊
const status = ref<LlmServiceStatus | null>(null);

// 正在下单的套餐标识，用于禁用重复点击
const busyPackage = ref("");
// 正在支付/校验凭证，避免重复提交
const paying = ref(false);
const applying = ref(false);

// 待支付订单：下单成功后弹确认框，支付完成才发放凭证
const pendingOrder = ref<BillingOrderResult | null>(null);
const payVisible = ref(false);
// 充值成功后的明文凭证，只在这里展示一次
const plainKey = ref("");
const licenseVisible = ref(false);
// 更换凭证弹窗
const inputVisible = ref(false);
const inputKey = ref("");
// 未激活状态下直接填写凭证
const inlineKey = ref("");

// 令牌按千分位展示，便于核对具体到账数量
const formatTokens = (value: number) => Math.round(value).toLocaleString();
// 金额按元展示：整数不带小数，非整数保留两位并去掉末尾的无意义 0
const formatYuanValue = (yuan: number) => (Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2).replace(/\.?0+$/, ""));
// 分转元，套餐售价统一走这里
const formatYuan = (fen: number) => formatYuanValue(fen / 100);
// 余额折合人民币：依赖套餐接口的兑换比例，取不到时不展示这一行
const balanceYuan = computed(() => {
  const current = wallet.value;
  const pricing = catalog.value?.pricing;
  if (!current || !pricing) return "";
  return formatYuanValue(current.balanceTokens / pricing.tokensPerYuan);
});

// 服务状态：充值接口不可用属于「服务级」问题，放在服务区提示，不占用余额区
type ServiceState = "topupDown" | "ready" | "healthy" | "degraded" | "down" | "unknown";
const serviceState = computed<ServiceState>(() => {
  if (walletError.value) return "topupDown";
  if (!status.value) return "unknown";
  return status.value.level;
});
const statusText = computed(() => {
  switch (serviceState.value) {
    case "topupDown":
      return $t("billing_statusTopupDown");
    case "ready":
      return $t("billing_statusReady");
    case "healthy":
      return $t("billing_statusHealthy");
    case "degraded":
      return $t("billing_statusDegraded");
    case "down":
      return $t("billing_statusDown");
    default:
      return $t("billing_statusUnknown");
  }
});
// 状态胶囊与圆点共用同一套配色，避免只靠文字传达状态
const statusPillClass = computed(() =>
  ({
    topupDown: "bg-sf-error-2 text-sf-error",
    ready: "bg-sf-bg text-sf-text-2",
    healthy: "bg-sf-success-2 text-sf-success",
    degraded: "bg-sf-warning-2 text-sf-warning",
    down: "bg-sf-error-2 text-sf-error",
    unknown: "bg-sf-bg text-sf-text-3",
  })[serviceState.value],
);
const statusDotClass = computed(() =>
  ({
    topupDown: "bg-sf-error",
    ready: "bg-sf-success",
    healthy: "bg-sf-success",
    degraded: "bg-sf-warning",
    down: "bg-sf-error",
    unknown: "bg-sf-text-3",
  })[serviceState.value],
);

// 上游额度只参与服务端的状态判定，这里不再展示任何额度或模型信息

// 余额：成功才清错误，重试期间错误内容保持不变，不会出现「框被关掉」的闪烁
async function loadWallet(retry = false) {
  if (retry) walletRetrying.value = true;
  else walletLoading.value = true;
  try {
    wallet.value = await getBillingWallet();
    walletError.value = "";
  } catch (error) {
    wallet.value = null;
    walletError.value = error instanceof Error ? error.message : String(error);
  } finally {
    walletLoading.value = false;
    walletRetrying.value = false;
  }
}

// 套餐与定价：与余额完全独立，余额挂了也照常能买
async function loadCatalog(retry = false) {
  if (retry) catalogRetrying.value = true;
  else catalogLoading.value = true;
  try {
    catalog.value = await getBillingCatalog();
    catalogError.value = "";
  } catch (error) {
    catalog.value = null;
    catalogError.value = error instanceof Error ? error.message : String(error);
  } finally {
    catalogLoading.value = false;
    catalogRetrying.value = false;
  }
}

// 状态读取失败只影响状态胶囊，其余功能照常可用
async function loadStatus() {
  try {
    status.value = await getLlmServiceStatus();
  } catch (error) {
    console.warn("读取上游服务状态失败", error);
  }
}

async function load() {
  await Promise.all([loadWallet(), loadCatalog()]);
  void loadStatus();
}

// 校验并绑定凭证：先按输入值查一次，通过了再落到本机，避免把错凭证写进存储
async function applyKey(rawKey: string) {
  const key = rawKey.trim();
  if (!key || applying.value) return;
  applying.value = true;
  try {
    const result = await getBillingWallet(key);
    if (!result.activated) {
      ElMessage.error($t("billing_licenseInvalid"));
      return;
    }
    saveLicenseKey(key);
    wallet.value = result;
    walletError.value = "";
    inlineKey.value = "";
    inputKey.value = "";
    inputVisible.value = false;
    ElMessage.success($t("billing_licenseApplied"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    applying.value = false;
  }
}

function openInput() {
  // 回填当前本机凭证，方便用户核对或整体替换
  inputKey.value = readLicenseKey();
  inputVisible.value = true;
}

// 下单：金额与到账令牌由服务端按套餐配置决定，前端只提交套餐标识
async function buy(pkg: BillingPackage) {
  if (busyPackage.value || paying.value) return;
  busyPackage.value = pkg.packageId;
  try {
    pendingOrder.value = await createBillingOrder(pkg.packageId);
    payVisible.value = true;
  } catch (error) {
    ElMessage.error($t("billing_orderFailed", { message: error instanceof Error ? error.message : String(error) }));
  } finally {
    busyPackage.value = "";
  }
}

// 模拟支付：服务端走完整回调验签，凭证只在本次响应返回，本机随即保存一份
async function pay() {
  const order = pendingOrder.value;
  if (!order || paying.value) return;
  paying.value = true;
  try {
    const result = await simulateBillingPayment(order.orderNo);
    payVisible.value = false;
    pendingOrder.value = null;

    if (result.repeated) {
      // 订单已发放过：服务端不保留明文，无法再次展示
      ElMessage.warning($t("billing_successRepeated"));
      await load();
      return;
    }

    // 续充到已有凭证：没有新凭证要展示，直接刷新余额即可
    if (!result.key) {
      ElMessage.success($t("billing_topupCredited", { tokens: formatTokens(result.tokens) }));
      await load();
      return;
    }

    saveLicenseKey(result.key);
    plainKey.value = result.key;
    licenseVisible.value = true;
    await load();
  } catch (error) {
    ElMessage.error($t("billing_payFailed", { message: error instanceof Error ? error.message : String(error) }));
  } finally {
    paying.value = false;
  }
}

// 复制凭证：剪贴板不可用时提示手动选中，不静默失败
async function copyKey() {
  if (!plainKey.value) return;
  try {
    await navigator.clipboard.writeText(plainKey.value);
    ElMessage.success($t("billing_licenseCopied"));
  } catch (error) {
    console.warn("复制凭证失败", error);
    ElMessage.warning($t("billing_licenseCopyFailed"));
  }
}

// 流水类型文案：人工调整单独展示，不会被误认为充值或对话消耗
const ledgerLabel = (type: string) => {
  if (type === "RECHARGE") return $t("billing_ledgerRecharge");
  if (type === "ADJUST") return $t("billing_ledgerAdjust");
  return $t("billing_ledgerConsume");
};
// 入账与扣减按令牌正负判断，人工扣减不会显示成收入色
const isCredit = (tokens: number) => tokens > 0;
// 流水时间只保留月日时分，减少占用宽度
const formatTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
};

// 设置弹窗每次打开都会重新挂载面板，进入即读取最新余额、套餐与服务状态
onMounted(load);
</script>

<template>
  <section class="flex min-w-0 flex-col gap-3">
    <!-- 品牌与状态：先讲清楚这是什么，再谈钱 -->
    <div class="flex min-w-0 flex-col gap-3 rounded-xl border border-sf-b p-3">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-[6px]">
          <SfIcon icon="fa6-solid:snowflake" size="5" class="shrink-0 text-sf-theme" />
          <h4 class="text-sm font-semibold text-sf-text">{{ $t("aiChat_snowflakeService") }}</h4>
          <span class="rounded-full bg-sf-theme-3 px-[6px] py-[3px] text-[11px] text-sf-theme">{{ $t("billing_official") }}</span>
        </div>
        <!-- 状态只给结论，模型名与额度属于内部诊断信息，不对外展示 -->
        <span class="flex shrink-0 items-center gap-[6px] rounded-full px-[6px] py-[3px] text-[11px]" :class="statusPillClass">
          <span class="h-[6px] w-[6px] rounded-full" :class="statusDotClass" />
          {{ statusText }}
        </span>
      </header>

      <p class="text-xs leading-6 text-sf-text-2">{{ $t("billing_serviceIntro") }}</p>

      <div class="flex flex-wrap gap-[6px]">
        <span class="rounded-full bg-sf-bg px-[6px] py-[3px] text-[11px] text-sf-text-2">{{ $t("billing_featureDirect") }}</span>
        <span class="rounded-full bg-sf-bg px-[6px] py-[3px] text-[11px] text-sf-text-2">{{ $t("billing_featureModel") }}</span>
      </div>

      <!-- 引导用户：不想用官方通道，也可以接自己的模型 -->
      <p class="text-[11px] leading-6 text-sf-text-3">{{ $t("billing_selfApiTip") }}</p>
    </div>

    <!-- 余额：只负责余额本身，读取失败也保留这个框，重试时内容不消失 -->
    <div class="flex min-w-0 flex-col gap-3 rounded-xl border border-sf-b p-3">
      <p v-if="walletLoading && !wallet" class="text-xs leading-6 text-sf-text-3">{{ $t("billing_loading") }}</p>

      <div v-else-if="walletError" class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-[3px]">
          <p class="text-xs font-medium text-sf-error">{{ $t("billing_balanceLoadFailed") }}</p>
          <p class="break-all text-[11px] leading-6 text-sf-text-3">{{ walletError }}</p>
        </div>
        <SfButton :round="false" type="bg" border :disabled="walletRetrying" @click="loadWallet(true)">
          {{ walletRetrying ? $t("billing_retrying") : $t("billing_retry") }}
        </SfButton>
      </div>

      <template v-else-if="wallet">
        <!-- 已绑定有效凭证：余额、脱敏凭证与更换入口 -->
        <template v-if="wallet.activated">
          <div class="flex flex-wrap gap-3">
            <div class="flex min-w-[96px] flex-1 flex-col gap-[3px]">
              <span class="text-[11px] text-sf-text-3">{{ $t("billing_balance") }}</span>
              <strong class="text-lg font-semibold tabular-nums text-sf-theme">{{ formatTokens(wallet.balanceTokens) }}</strong>
              <span v-if="balanceYuan" class="text-[11px] text-sf-text-3">{{ $t("billing_balanceValue", { amount: balanceYuan }) }}</span>
            </div>
            <div class="flex min-w-[96px] flex-1 flex-col gap-[3px]">
              <span class="text-[11px] text-sf-text-3">{{ $t("billing_consumed") }}</span>
              <strong class="text-lg font-semibold tabular-nums text-sf-text">{{ formatTokens(wallet.totalConsumedTokens) }}</strong>
              <span class="text-[11px] text-sf-text-3">{{ $t("billing_recharged", { tokens: formatTokens(wallet.totalRechargedTokens) }) }}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-sf-b pt-3">
            <span class="flex min-w-0 items-baseline gap-[6px]">
              <span class="text-[11px] text-sf-text-3">{{ $t("billing_currentLicense") }}</span>
              <code class="truncate font-mono text-xs text-sf-text">{{ wallet.licenseKeyPreview }}</code>
            </span>
            <SfButton :round="false" type="bg" border @click="openInput">{{ $t("billing_licenseChange") }}</SfButton>
          </div>
        </template>

        <!-- 未绑定凭证：区分「还没充」与「填错了」 -->
        <template v-else>
          <p class="text-xs font-medium" :class="wallet.invalid ? 'text-sf-error' : 'text-sf-text'">
            {{ wallet.invalid ? $t("billing_invalidTip") : $t("billing_inactiveTitle") }}
          </p>
          <p class="text-[11px] leading-6 text-sf-text-2">{{ $t("billing_inactiveTip") }}</p>
          <SfInput
            v-model="inlineKey"
            class="h-9 w-full rounded-lg! border border-sf-b bg-sf-bg!"
            :placeholder="$t('billing_licenseInputPlaceholder')"
            :disabled="applying"
          />
          <div class="flex justify-end">
            <SfButton :round="false" :disabled="applying || !inlineKey.trim()" @click="applyKey(inlineKey)">
              {{ applying ? $t("billing_licenseApplying") : $t("billing_licenseApply") }}
            </SfButton>
          </div>
        </template>
      </template>
    </div>

    <!-- 套餐：与余额分开请求，余额异常也能正常购买 -->
    <section class="flex min-w-0 flex-col gap-3">
      <header class="flex flex-wrap items-baseline justify-between gap-3">
        <h5 class="text-xs font-medium text-sf-text">{{ $t("billing_packagesTitle") }}</h5>
        <span v-if="catalog" class="text-[11px] text-sf-text-3">
          {{ $t("billing_rate", { tokens: formatTokens(catalog.pricing.tokensPerYuan) }) }}
          · {{ $t("billing_timeRatio", { ratio: catalog.pricing.timeRatio }) }}
        </span>
      </header>

      <p v-if="catalogLoading && !catalog" class="text-xs leading-6 text-sf-text-3">{{ $t("billing_loading") }}</p>

      <div v-else-if="catalogError" class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dashed border-sf-b p-3">
        <div class="flex min-w-0 flex-col gap-[3px]">
          <p class="text-xs font-medium text-sf-error">{{ $t("billing_catalogLoadFailed") }}</p>
          <p class="break-all text-[11px] leading-6 text-sf-text-3">{{ catalogError }}</p>
        </div>
        <SfButton :round="false" type="bg" border :disabled="catalogRetrying" @click="loadCatalog(true)">
          {{ catalogRetrying ? $t("billing_retrying") : $t("billing_retry") }}
        </SfButton>
      </div>

      <div v-else-if="catalog" class="grid grid-cols-2 gap-3">
        <button
          v-for="pkg in catalog.packages"
          :key="pkg.packageId"
          type="button"
          class="flex cursor-pointer flex-col gap-[3px] rounded-xl border p-3 text-left transition-colors disabled:cursor-wait disabled:opacity-60"
          :class="busyPackage === pkg.packageId ? 'border-sf-theme bg-sf-theme-3' : 'border-sf-b hover:border-sf-theme'"
          :disabled="Boolean(busyPackage)"
          @click="buy(pkg)"
        >
          <span class="flex items-baseline justify-between gap-3">
            <strong class="text-lg font-semibold tabular-nums text-sf-text">¥{{ formatYuan(pkg.amountFen) }}</strong>
            <span v-if="pkg.badge" class="rounded-full bg-sf-success-2 px-[6px] py-[3px] text-[11px] text-sf-success">{{ pkg.badge }}</span>
          </span>
          <span class="text-xs tabular-nums text-sf-text-2">{{ formatTokens(pkg.tokens) }} {{ $t("billing_tokenUnit") }}</span>
          <span class="flex items-baseline justify-between gap-3 text-[11px]">
            <span class="text-sf-text-3">{{ pkg.name }}</span>
            <!-- 右下角给一个明确动作，避免整卡可点却没有提示 -->
            <span class="text-sf-theme">{{ busyPackage === pkg.packageId ? $t("billing_ordering") : $t("billing_buy") }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- 没有云端账户，这句必须在购买前就说清楚 -->
    <p class="text-[11px] leading-6 text-sf-text-3">{{ $t("billing_localOnlyTip") }}</p>

    <!-- 最近流水只展示必要信息，完整账单由服务端接口提供 -->
    <div v-if="wallet?.activated" class="flex flex-col gap-[6px]">
      <h5 class="text-[11px] text-sf-text-3">{{ $t("billing_ledger") }}</h5>
      <p v-if="!wallet.recentLedger.length" class="text-[11px] leading-6 text-sf-text-3">{{ $t("billing_ledgerEmpty") }}</p>
      <div v-else class="flex flex-col gap-[6px]">
        <div v-for="item in wallet.recentLedger" :key="item.id" class="flex items-center justify-between gap-3 text-[11px]">
          <span class="min-w-0 flex-1 truncate text-sf-text-2">
            {{ ledgerLabel(item.type) }}
            <span v-if="item.model" class="text-sf-text-3">· {{ item.model }}</span>
          </span>
          <span class="shrink-0 tabular-nums" :class="isCredit(item.tokens) ? 'text-sf-success' : 'text-sf-text-2'">
            {{ item.tokens > 0 ? `+${formatTokens(item.tokens)}` : formatTokens(item.tokens) }}
          </span>
          <span class="shrink-0 text-sf-text-3 tabular-nums">{{ formatTime(item.createdAt) }}</span>
        </div>
      </div>
    </div>

    <!-- 支付确认：模拟渠道不会真实扣款，接真实渠道后这里换成跳转收银台 -->
    <SfModal v-model="payVisible" :title="$t('billing_payTitle')" width="420px" :before-close="() => !paying">
      <div v-if="pendingOrder" class="flex flex-col gap-3">
        <dl class="flex flex-col gap-[6px] text-xs">
          <div class="flex items-center justify-between gap-3">
            <dt class="text-sf-text-2">{{ $t("billing_payAmount") }}</dt>
            <dd class="font-semibold tabular-nums text-sf-text">¥{{ formatYuan(pendingOrder.amountFen) }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-sf-text-2">{{ $t("billing_payTokens") }}</dt>
            <dd class="font-semibold tabular-nums text-sf-theme">{{ formatTokens(pendingOrder.tokens) }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-sf-text-2">{{ $t("billing_payOrderNo") }}</dt>
            <dd class="font-mono text-[11px] text-sf-text-3">{{ pendingOrder.orderNo }}</dd>
          </div>
        </dl>
        <p v-if="pendingOrder.topUp" class="text-[11px] leading-6 text-sf-text-2">{{ $t("billing_payTopUpTip") }}</p>
        <p class="text-[11px] leading-6 text-sf-text-3">{{ $t("billing_payMockTip") }}</p>
        <footer class="flex justify-end gap-3 border-t border-sf-b pt-3">
          <SfButton :round="false" type="bg" border :disabled="paying" @click="payVisible = false">{{ $t("cancel") }}</SfButton>
          <SfButton :round="false" :disabled="paying" @click="pay">
            {{ paying ? $t("billing_paying") : $t("billing_payNow") }}
          </SfButton>
        </footer>
      </div>
    </SfModal>

    <!-- 充值成功：凭证只在这里出现一次，服务端不保留明文 -->
    <SfModal v-model="licenseVisible" :title="$t('billing_successTitle')" width="460px">
      <div class="flex flex-col gap-3">
        <p class="break-all rounded-lg bg-sf-bg p-3 text-center font-mono text-sm leading-6 text-sf-text select-all">
          {{ groupLicenseKey(plainKey) }}
        </p>
        <div class="flex justify-center">
          <SfButton :round="false" type="bg" border @click="copyKey">{{ $t("billing_copy") }}</SfButton>
        </div>
        <ul class="flex flex-col gap-[6px] text-[11px] leading-6 text-sf-text-2">
          <li class="text-sf-error">{{ $t("billing_successOnceTip") }}</li>
          <li>{{ $t("billing_successSavedTip") }}</li>
          <li>{{ $t("billing_successWarnTip") }}</li>
        </ul>
        <footer class="flex justify-end border-t border-sf-b pt-3">
          <SfButton :round="false" @click="licenseVisible = false">{{ $t("billing_successConfirm") }}</SfButton>
        </footer>
      </div>
    </SfModal>

    <!-- 更换凭证：绑定前先校验，校验通过才写入本机 -->
    <SfModal v-model="inputVisible" :title="$t('billing_licenseChange')" width="460px">
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-[6px] text-[11px] text-sf-text-2">
          {{ $t("billing_licenseInputLabel") }}
          <SfInput
            v-model="inputKey"
            class="h-9 w-full rounded-lg! border border-sf-b bg-sf-bg!"
            :placeholder="$t('billing_licenseInputPlaceholder')"
            :disabled="applying"
          />
        </label>
        <p class="text-[11px] leading-6 text-sf-text-3">{{ $t("billing_localOnlyTip") }}</p>
        <footer class="flex justify-end gap-3 border-t border-sf-b pt-3">
          <SfButton :round="false" type="bg" border :disabled="applying" @click="inputVisible = false">{{ $t("cancel") }}</SfButton>
          <SfButton :round="false" :disabled="applying || !inputKey.trim()" @click="applyKey(inputKey)">
            {{ applying ? $t("billing_licenseApplying") : $t("billing_licenseApply") }}
          </SfButton>
        </footer>
      </div>
    </SfModal>
  </section>
</template>
