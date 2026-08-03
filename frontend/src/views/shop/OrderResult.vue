<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { getOrder } from "@/services/apis/order";
import { reportErrorMsg } from "@/tools/validator";
import type { Order } from "@/types/business";
import { OrderStatus } from "@/types/business";
import { onMounted, onUnmounted, ref } from "vue";

const POLL_INTERVAL = 3000;

const initialResult = ref<"success" | "failure">("failure");
const orderNo = ref("");
const order = ref<Order | null>(null);
const pollError = ref(false);
let pollTask: ReturnType<typeof setInterval> | null = null;

const { execute: fetchOrder } = getOrder();

// Terminal states after which polling stops.
const TERMINAL = [OrderStatus.COMPLETED, OrderStatus.FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED];

const statusTitle = (): string => {
  const status = order.value?.status;
  switch (status) {
    case OrderStatus.PENDING:
      return t("TXT_CODE_ORDER_RESULT_PENDING");
    case OrderStatus.PAID:
      return t("TXT_CODE_ORDER_RESULT_PAID");
    case OrderStatus.PROVISIONING:
      return t("TXT_CODE_ORDER_RESULT_PROVISIONING");
    case OrderStatus.COMPLETED:
      return t("TXT_CODE_ORDER_RESULT_COMPLETED");
    case OrderStatus.FAILED:
      return t("TXT_CODE_ORDER_RESULT_FAILED");
    case OrderStatus.REFUNDED:
      return t("TXT_CODE_ORDER_RESULT_REFUNDED");
    case OrderStatus.CANCELLED:
      return t("TXT_CODE_ORDER_RESULT_CANCELLED");
    default:
      return initialResult.value === "success"
        ? t("TXT_CODE_ORDER_RESULT_SUCCESS")
        : t("TXT_CODE_ORDER_RESULT_FAILURE");
  }
};

const statusType = (): "success" | "error" | "info" | "warning" => {
  const status = order.value?.status;
  switch (status) {
    case OrderStatus.COMPLETED:
      return "success";
    case OrderStatus.FAILED:
    case OrderStatus.CANCELLED:
    case OrderStatus.REFUNDED:
      return "error";
    case OrderStatus.PAID:
    case OrderStatus.PROVISIONING:
      return "info";
    case OrderStatus.PENDING:
      return initialResult.value === "success" ? "info" : "warning";
    default:
      return initialResult.value === "success" ? "success" : "error";
  }
};

const stopPolling = () => {
  if (pollTask) {
    clearInterval(pollTask);
    pollTask = null;
  }
};

const loadOrder = async () => {
  if (!orderNo.value) return;
  try {
    const result = await fetchOrder({
      params: { uuid: orderNo.value },
      url: `/api/order/${orderNo.value}`,
      forceRequest: true
    });
    order.value = result.value || null;
    pollError.value = false;
    if (order.value && TERMINAL.includes(order.value.status)) stopPolling();
  } catch (error: any) {
    pollError.value = true;
    reportErrorMsg(error);
    stopPolling();
  }
};

const startPolling = () => {
  stopPolling();
  loadOrder();
  pollTask = setInterval(loadOrder, POLL_INTERVAL);
};

const goOrders = () => {
  router.push({ path: "/shop/orders" });
};

const goShop = () => {
  router.push({ path: "/shop" });
};

onMounted(() => {
  const query = router.currentRoute.value.query;
  orderNo.value = String(query.orderNo || "");
  initialResult.value = query.result === "success" ? "success" : "failure";
  if (orderNo.value) startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="result-page">
    <div class="result-body">
      <CardPanel>
        <template #body>
          <a-result
            :status="statusType()"
            :title="statusTitle()"
            :sub-title="
              order?.status === OrderStatus.FAILED && order.remark
                ? order.remark
                : orderNo
                  ? `ID: ${orderNo}`
                  : ''
            "
          >
            <template #extra>
              <a-spin v-if="orderNo && !pollError && !TERMINAL.includes(order?.status as number)" size="small">
                {{ t("TXT_CODE_ORDER_RESULT_POLLING") }}
              </a-spin>
              <div v-else-if="pollError" class="poll-error">
                {{ t("TXT_CODE_ORDER_RESULT_POLLING_FAILED") }}
              </div>
              <div class="actions">
                <a-button type="primary" @click="goOrders">
                  {{ t("TXT_CODE_ORDER_RESULT_BACK") }}
                </a-button>
                <a-button @click="goShop">{{ t("TXT_CODE_SHOP_TITLE") }}</a-button>
              </div>
            </template>
          </a-result>
        </template>
      </CardPanel>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.result-page {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
  background-color: #29292957;
  backdrop-filter: saturate(120%) blur(10px);
  overflow-y: auto;

  .result-body {
    max-width: 460px;
    margin: 0 auto;
    padding: 84px 12px;
  }

  .poll-error {
    color: var(--error-color);
    margin-bottom: 12px;
  }

  .actions {
    margin-top: 12px;
  }
}
</style>
