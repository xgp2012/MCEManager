<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import {
  getAdminOrderDetail,
  listAdminOrders,
  markOrderPaid,
  refundOrder,
  retryProvisionOrder
} from "@/services/apis/adminOrder";
import { reportErrorMsg } from "@/tools/validator";
import type { AdminOrder } from "@/types/business";
import { OrderStatus, OrderType } from "@/types/business";
import { message, Modal } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchOrders, state: pageState, isLoading } = listAdminOrders();
const { execute: submitRetry } = retryProvisionOrder();
const { execute: submitRefund } = refundOrder();
const { execute: submitMarkPaid } = markOrderPaid();
const { execute: fetchDetail, state: detailState } = getAdminOrderDetail();

const orders = ref<AdminOrder[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref("");
const statusFilter = ref<number | undefined>(undefined);
const typeFilter = ref<number | undefined>(undefined);
const detailVisible = ref(false);
const detail = ref<AdminOrder | null>(null);

const statusOptions = [
  { value: OrderStatus.PENDING, label: t("TXT_CODE_ORDER_STATUS_PENDING") },
  { value: OrderStatus.PAID, label: t("TXT_CODE_ORDER_STATUS_PAID") },
  { value: OrderStatus.PROVISIONING, label: t("TXT_CODE_ORDER_STATUS_PROVISIONING") },
  { value: OrderStatus.COMPLETED, label: t("TXT_CODE_ORDER_STATUS_COMPLETED") },
  { value: OrderStatus.FAILED, label: t("TXT_CODE_ORDER_STATUS_FAILED") },
  { value: OrderStatus.REFUNDED, label: t("TXT_CODE_ORDER_STATUS_REFUNDED") },
  { value: OrderStatus.CANCELLED, label: t("TXT_CODE_ORDER_STATUS_CANCELLED") }
];

const typeOptions = [
  { value: OrderType.PURCHASE, label: t("TXT_CODE_ADMIN_ORDER_TYPE_PURCHASE") },
  { value: OrderType.RENEW, label: t("TXT_CODE_ADMIN_ORDER_TYPE_RENEW") },
  { value: OrderType.UPGRADE, label: t("TXT_CODE_ADMIN_ORDER_TYPE_UPGRADE") }
];

const statusLabel = (status: number) =>
  statusOptions.find((item) => item.value === status)?.label || String(status);

const statusColor = (status: number) => {
  switch (status) {
    case OrderStatus.PENDING:
      return "orange";
    case OrderStatus.PAID:
      return "blue";
    case OrderStatus.PROVISIONING:
      return "cyan";
    case OrderStatus.COMPLETED:
      return "green";
    case OrderStatus.FAILED:
      return "red";
    default:
      return "default";
  }
};

const typeLabel = (type: number) =>
  typeOptions.find((item) => item.value === type)?.label || String(type);

const loadOrders = async () => {
  await fetchOrders({
    params: {
      page: page.value,
      page_size: pageSize.value,
      status: statusFilter.value,
      type: typeFilter.value,
      keyword: keyword.value || undefined
    },
    forceRequest: true
  });
  orders.value = pageState.value?.data || [];
  total.value = pageState.value?.total || 0;
};

const handleSearch = () => {
  page.value = 1;
  loadOrders();
};

const openDetail = async (order: AdminOrder) => {
  detailVisible.value = true;
  detail.value = null;
  try {
    await fetchDetail({
      params: { uuid: order.uuid },
      url: `/api/admin/orders/${order.uuid}`,
      forceRequest: true
    });
    detail.value = detailState.value || null;
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleRetry = async (order: AdminOrder) => {
  try {
    await submitRetry({
      params: { uuid: order.uuid },
      url: `/api/admin/orders/${order.uuid}/retry-provision`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadOrders();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleMarkPaid = (order: AdminOrder) => {
  Modal.confirm({
    title: t("TXT_CODE_ADMIN_ORDER_MARK_PAID_CONFIRM"),
    okText: t("TXT_CODE_31e92ef3"),
    cancelText: t("TXT_CODE_3b1cc020"),
    onOk: async () => {
      try {
        await submitMarkPaid({
          params: { uuid: order.uuid },
          url: `/api/admin/orders/${order.uuid}/mark-paid`,
          forceRequest: true
        });
        message.success(t("TXT_CODE_7f0c746d"));
        loadOrders();
      } catch (error: any) {
        reportErrorMsg(error);
      }
    }
  });
};

const handleRefund = (order: AdminOrder) => {
  Modal.confirm({
    title: t("TXT_CODE_ADMIN_ORDER_REFUND_CONFIRM"),
    okText: t("TXT_CODE_31e92ef3"),
    cancelText: t("TXT_CODE_3b1cc020"),
    okType: "danger",
    onOk: async () => {
      try {
        await submitRefund({
          params: { uuid: order.uuid },
          data: { reason: t("TXT_CODE_ADMIN_ORDER_REFUND_DEFAULT_REASON") },
          url: `/api/admin/orders/${order.uuid}/refund`,
          forceRequest: true
        });
        message.success(t("TXT_CODE_7f0c746d"));
        loadOrders();
      } catch (error: any) {
        reportErrorMsg(error);
      }
    }
  });
};

const formatTime = (value: string | number) => {
  if (!value) return "-";
  const date = new Date(value);
  return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const formatMoney = (value: number) => `¥ ${(Number(value) / 100).toFixed(2)}`;

onMounted(() => {
  loadOrders();
});
</script>

<template>
  <div class="order-list-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ADMIN_ORDERS") }}</span>
      </template>
      <template #body>
        <div class="toolbar">
          <a-input
            v-model:value="keyword"
            :placeholder="t('TXT_CODE_ADMIN_ORDER_SEARCH_PLACEHOLDER')"
            allow-clear
            style="width: 240px"
            @press-enter="handleSearch"
          />
          <a-select
            v-model:value="statusFilter"
            :placeholder="t('TXT_CODE_ADMIN_STATUS_FILTER')"
            allow-clear
            style="width: 160px"
            @change="handleSearch"
          >
            <a-select-option v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-select-option>
          </a-select>
          <a-select
            v-model:value="typeFilter"
            :placeholder="t('TXT_CODE_ADMIN_TYPE_FILTER')"
            allow-clear
            style="width: 140px"
            @change="handleSearch"
          >
            <a-select-option v-for="option in typeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-select-option>
          </a-select>
          <a-button type="primary" @click="handleSearch">
            {{ t("TXT_CODE_31e92ef3") }}
          </a-button>
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
              <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            </template>
            <template v-else-if="column.key === 'type'">
              {{ typeLabel(record.type) }}
            </template>
            <template v-else-if="column.key === 'amount'">
              {{ formatMoney(record.amount) }}
            </template>
            <template v-else-if="column.key === 'payTime'">
              {{ formatTime(record.payTime) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openDetail(record as AdminOrder)">
                  {{ t("TXT_CODE_ADMIN_DETAIL") }}
                </a-button>
                <a-button
                  v-if="record.status === OrderStatus.FAILED"
                  size="small"
                  type="primary"
                  @click="handleRetry(record as AdminOrder)"
                >
                  {{ t("TXT_CODE_ADMIN_ORDER_RETRY") }}
                </a-button>
                <a-button
                  v-if="record.status === OrderStatus.PENDING"
                  size="small"
                  @click="handleMarkPaid(record as AdminOrder)"
                >
                  {{ t("TXT_CODE_ADMIN_ORDER_MARK_PAID") }}
                </a-button>
                <a-button
                  v-if="record.status === OrderStatus.PAID || record.status === OrderStatus.PROVISIONING || record.status === OrderStatus.COMPLETED"
                  size="small"
                  danger
                  @click="handleRefund(record as AdminOrder)"
                >
                  {{ t("TXT_CODE_ADMIN_ORDER_REFUND") }}
                </a-button>
              </a-space>
            </template>
          </template>
          <a-table-column key="uuid" title="ID" data-index="uuid" width="180" />
          <a-table-column key="userName" :title="t('TXT_CODE_ADMIN_USERNAME')" data-index="userName" />
          <a-table-column key="planName" :title="t('TXT_CODE_ADMIN_PLAN')" data-index="planName" />
          <a-table-column key="subject" :title="t('TXT_CODE_ORDER_SUBJECT')" data-index="subject" />
          <a-table-column key="type" :title="t('TXT_CODE_ADMIN_ORDER_TYPE')" align="center" />
          <a-table-column key="amount" :title="t('TXT_CODE_ORDER_AMOUNT')" align="right" />
          <a-table-column key="status" :title="t('TXT_CODE_ORDER_STATUS')" align="center" />
          <a-table-column key="payTime" :title="t('TXT_CODE_ADMIN_PAY_TIME')" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>

    <a-drawer v-model:open="detailVisible" :title="t('TXT_CODE_ADMIN_ORDER_DETAIL')" width="640">
      <template v-if="detail">
        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_ORDER_NO')">
            {{ detail.uuid }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_USERNAME')">
            {{ detail.userName }} ({{ detail.userEmail }})
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_PLAN')">
            {{ detail.planName }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ORDER_SUBJECT')">
            {{ detail.subject }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ORDER_AMOUNT')">
            {{ detail.currency }} {{ formatMoney(detail.amount) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_ORDER_TYPE')">
            {{ typeLabel(detail.type) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ORDER_STATUS')">
            <a-tag :color="statusColor(detail.status)">{{ statusLabel(detail.status) }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_INSTANCE_ID')">
            {{ detail.instanceUuid || "-" }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_PAY_GATEWAY')">
            {{ detail.payGateway || "-" }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_PAY_ORDER_NO')">
            {{ detail.payOrderNo || "-" }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_PAY_TIME')">
            {{ formatTime(detail.payTime) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_CREATED_AT')">
            {{ formatTime(detail.createdAt) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_REMARK')">
            {{ detail.remark || "-" }}
          </a-descriptions-item>
        </a-descriptions>

        <template v-if="detail.payRawParsed">
          <a-divider>{{ t("TXT_CODE_ADMIN_CALLBACK_RAW") }}</a-divider>
          <pre class="raw-json">{{ JSON.stringify(detail.payRawParsed, null, 2) }}</pre>
        </template>
      </template>
    </a-drawer>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.order-list-page {
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .raw-json {
    background-color: var(--background-color-grey);
    padding: 8px;
    border-radius: 4px;
    max-height: 300px;
    overflow: auto;
    font-size: 12px;
  }
}
</style>
