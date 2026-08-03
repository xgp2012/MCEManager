<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { cancelOrder, getOrderPayLink, listMyOrders } from "@/services/apis/order";
import { reportErrorMsg } from "@/tools/validator";
import type { Order } from "@/types/business";
import { OrderStatus } from "@/types/business";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchOrders, state: pageState, isLoading } = listMyOrders();
const { execute: submitPay } = getOrderPayLink();
const { execute: submitCancel } = cancelOrder();

const orders = ref<Order[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const statusLabel = (status: number) => {
  switch (status) {
    case OrderStatus.PENDING:
      return { text: t("TXT_CODE_ORDER_STATUS_PENDING"), color: "orange" };
    case OrderStatus.PAID:
      return { text: t("TXT_CODE_ORDER_STATUS_PAID"), color: "blue" };
    case OrderStatus.PROVISIONING:
      return { text: t("TXT_CODE_ORDER_STATUS_PROVISIONING"), color: "cyan" };
    case OrderStatus.COMPLETED:
      return { text: t("TXT_CODE_ORDER_STATUS_COMPLETED"), color: "green" };
    case OrderStatus.FAILED:
      return { text: t("TXT_CODE_ORDER_STATUS_FAILED"), color: "red" };
    case OrderStatus.REFUNDED:
      return { text: t("TXT_CODE_ORDER_STATUS_REFUNDED"), color: "default" };
    default:
      return { text: t("TXT_CODE_ORDER_STATUS_CANCELLED"), color: "default" };
  }
};

const loadOrders = async () => {
  await fetchOrders({
    params: { page: page.value, page_size: pageSize.value },
    forceRequest: true
  });
  orders.value = pageState.value?.data || [];
  total.value = pageState.value?.total || 0;
};

const handlePay = async (order: Order) => {
  try {
    const result = await submitPay({
      params: { uuid: order.uuid },
      url: `/api/order/${order.uuid}/pay`,
      forceRequest: true
    });
    if (result.value?.payUrl) {
      window.open(result.value.payUrl, "_blank");
    }
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleCancel = async (order: Order) => {
  try {
    await submitCancel({
      params: { uuid: order.uuid },
      url: `/api/order/${order.uuid}/cancel`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadOrders();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const goBack = () => {
  router.push({ path: "/shop" });
};

onMounted(() => {
  loadOrders();
});
</script>

<template>
  <div class="orders-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ORDER_LIST") }}</span>
      </template>
      <template #body>
        <div class="toolbar">
          <div class="spacer" />
          <a-button @click="goBack">{{ t("TXT_CODE_SHOP_TITLE") }}</a-button>
        </div>

        <a-table
          :data-source="orders"
          :loading="isLoading"
          :pagination="{
            current: page,
            pageSize,
            total,
            showSizeChanger: true
          }"
          row-key="uuid"
          size="middle"
          @change="(pagination: any) => {
            page = pagination.current || 1;
            pageSize = pagination.pageSize || 10;
            loadOrders();
          }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="statusLabel(record.status).color">
                {{ statusLabel(record.status).text }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button
                  v-if="record.status === OrderStatus.PENDING"
                  size="small"
                  type="primary"
                  @click="handlePay(record as Order)"
                >
                  {{ t("TXT_CODE_ORDER_PAY") }}
                </a-button>
                <a-button
                  v-if="record.status === OrderStatus.PENDING"
                  size="small"
                  danger
                  @click="handleCancel(record as Order)"
                >
                  {{ t("TXT_CODE_ORDER_CANCEL") }}
                </a-button>
              </a-space>
            </template>
          </template>
          <a-table-column key="uuid" title="ID" data-index="uuid" width="180" />
          <a-table-column key="subject" :title="t('TXT_CODE_ORDER_SUBJECT')" data-index="subject" />
          <a-table-column key="amount" :title="t('TXT_CODE_ORDER_AMOUNT')">
            <template #default="{ record }">
              {{ record.currency }} {{ (record.amount / 100).toFixed(2) }}
            </template>
          </a-table-column>
          <a-table-column key="status" :title="t('TXT_CODE_ORDER_STATUS')" align="center" />
          <a-table-column key="createdAt" :title="t('TXT_CODE_ORDER_TIME')" data-index="createdAt" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.orders-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;

  .toolbar {
    display: flex;
    align-items: center;
    margin-bottom: 16px;

    .spacer {
      flex: 1;
    }
  }
}
</style>
