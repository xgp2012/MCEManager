<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import { exportOperationLog, exportPaymentLog, getOperationLogPage, getPaymentLogPage } from "@/services/apis/adminLog";
import { reportErrorMsg } from "@/tools/validator";
import type { PaymentLogEntry } from "@/types/business";
import { OrderStatus, OrderType } from "@/types/business";
import type { OperationLoggerItem } from "@/types/operationLog";
import { onMounted, ref } from "vue";

const { execute: fetchOperations, state: operationState, isLoading: opLoading } = getOperationLogPage();
const { execute: fetchPayments, state: paymentState, isLoading: payLoading } = getPaymentLogPage();
const { execute: fetchExportOperations } = exportOperationLog();
const { execute: fetchExportPayments } = exportPaymentLog();

const activeTab = ref("operation");

const operationLogs = ref<OperationLoggerItem[]>([]);
const opTotal = ref(0);
const opPage = ref(1);
const opPageSize = ref(20);
const opLevel = ref<string | undefined>(undefined);
const opKeyword = ref("");

const paymentLogs = ref<PaymentLogEntry[]>([]);
const payTotal = ref(0);
const payPage = ref(1);
const payPageSize = ref(20);
const payStatus = ref<number | undefined>(undefined);

const levelOptions = [
  { value: "info", label: t("TXT_CODE_ADMIN_LOG_LEVEL_INFO") },
  { value: "warning", label: t("TXT_CODE_ADMIN_LOG_LEVEL_WARNING") },
  { value: "error", label: t("TXT_CODE_ADMIN_LOG_LEVEL_ERROR") }
];

const levelColor = (level: string) => {
  switch (level) {
    case "info":
      return "blue";
    case "warning":
      return "orange";
    default:
      return "red";
  }
};

const loadOperations = async () => {
  await fetchOperations({
    params: {
      page: opPage.value,
      page_size: opPageSize.value,
      level: opLevel.value,
      keyword: opKeyword.value || undefined
    },
    forceRequest: true
  });
  operationLogs.value = operationState.value?.data || [];
  opTotal.value = operationState.value?.total || 0;
};

const loadPayments = async () => {
  await fetchPayments({
    params: {
      page: payPage.value,
      page_size: payPageSize.value,
      status: payStatus.value
    },
    forceRequest: true
  });
  paymentLogs.value = paymentState.value?.data || [];
  payTotal.value = paymentState.value?.total || 0;
};

const onTabChange = (key: string | number) => {
  const value = String(key);
  activeTab.value = value;
  if (value === "operation") loadOperations();
  else loadPayments();
};

const searchOperation = () => {
  opPage.value = 1;
  loadOperations();
};

const searchPayment = () => {
  payPage.value = 1;
  loadPayments();
};

const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const exportOperations = async () => {
  try {
    const state = await fetchExportOperations({
      params: {
        level: opLevel.value,
        keyword: opKeyword.value || undefined
      },
      forceRequest: true
    });
    if (state.value) downloadCSV(state.value, `operation_logs_${Date.now()}.csv`);
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const exportPayments = async () => {
  try {
    const state = await fetchExportPayments({
      params: {
        status: payStatus.value
      },
      forceRequest: true
    });
    if (state.value) downloadCSV(state.value, `payment_logs_${Date.now()}.csv`);
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const formatTime = (value: string | number) => {
  if (!value) return "-";
  const date = new Date(Number(value));
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const logTargetLabel = (log: OperationLoggerItem | Record<string, any>) => {
  const anyLog = log as any;
  return anyLog.target_user_name || anyLog.instance_name || anyLog.order_id || anyLog.subscription_id || anyLog.daemon_id || "-";
};

const paymentStatusLabel = (status: number) => {
  switch (status) {
    case OrderStatus.PENDING:
      return t("TXT_CODE_ORDER_STATUS_PENDING");
    case OrderStatus.PAID:
      return t("TXT_CODE_ORDER_STATUS_PAID");
    case OrderStatus.PROVISIONING:
      return t("TXT_CODE_ORDER_STATUS_PROVISIONING");
    case OrderStatus.COMPLETED:
      return t("TXT_CODE_ORDER_STATUS_COMPLETED");
    case OrderStatus.FAILED:
      return t("TXT_CODE_ORDER_STATUS_FAILED");
    case OrderStatus.REFUNDED:
      return t("TXT_CODE_ORDER_STATUS_REFUNDED");
    default:
      return t("TXT_CODE_ORDER_STATUS_CANCELLED");
  }
};

const paymentTypeLabel = (type: number) => {
  switch (type) {
    case OrderType.PURCHASE:
      return t("TXT_CODE_ADMIN_ORDER_TYPE_PURCHASE");
    case OrderType.RENEW:
      return t("TXT_CODE_ADMIN_ORDER_TYPE_RENEW");
    default:
      return t("TXT_CODE_ADMIN_ORDER_TYPE_UPGRADE");
  }
};

const formatMoney = (value: number) => `¥ ${(Number(value) / 100).toFixed(2)}`;

onMounted(() => {
  loadOperations();
});
</script>

<template>
  <div class="logs-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ADMIN_LOGS") }}</span>
      </template>
      <template #body>
        <a-tabs :active-key="activeTab" @change="onTabChange">
          <a-tab-pane :key="'operation'" :tab="t('TXT_CODE_ADMIN_OPERATION_LOG')">
            <div class="toolbar">
              <a-select
                v-model:value="opLevel"
                :placeholder="t('TXT_CODE_ADMIN_LOG_LEVEL_FILTER')"
                allow-clear
                style="width: 140px"
                @change="searchOperation"
              >
                <a-select-option v-for="option in levelOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </a-select-option>
              </a-select>
              <a-input
                v-model:value="opKeyword"
                :placeholder="t('TXT_CODE_ADMIN_LOG_KEYWORD')"
                allow-clear
                style="width: 240px"
                @press-enter="searchOperation"
              />
              <a-button type="primary" @click="searchOperation">
                {{ t("TXT_CODE_31e92ef3") }}
              </a-button>
              <a-button @click="exportOperations">
                {{ t("TXT_CODE_ADMIN_LOG_EXPORT") }}
              </a-button>
            </div>
            <a-table
              :data-source="operationLogs"
              :loading="opLoading"
              :pagination="{
                current: opPage,
                pageSize: opPageSize,
                total: opTotal,
                showSizeChanger: true
              }"
              row-key="operation_id"
              size="middle"
              @change="(pagination: any) => {
                opPage = pagination.current || 1;
                opPageSize = pagination.pageSize || 20;
                loadOperations();
              }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'level'">
                  <a-tag :color="levelColor(record.operation_level)">
                    {{ record.operation_level }}
                  </a-tag>
                </template>
                <template v-else-if="column.key === 'time'">
                  {{ formatTime(record.operation_time) }}
                </template>
                <template v-else-if="column.key === 'target'">
                  {{ logTargetLabel(record) }}
                </template>
              </template>
              <a-table-column key="type" :title="t('TXT_CODE_ADMIN_LOG_ACTION')" data-index="type" />
              <a-table-column key="operator_name" :title="t('TXT_CODE_ADMIN_LOG_OPERATOR')" data-index="operator_name" />
              <a-table-column key="target" :title="t('TXT_CODE_ADMIN_LOG_TARGET')" />
              <a-table-column key="level" :title="t('TXT_CODE_ADMIN_LOG_LEVEL')" align="center" />
              <a-table-column key="operator_ip" :title="t('TXT_CODE_ADMIN_LOG_IP')" data-index="operator_ip" />
              <a-table-column key="time" :title="t('TXT_CODE_ADMIN_LOG_TIME')" />
            </a-table>
          </a-tab-pane>

          <a-tab-pane :key="'payment'" :tab="t('TXT_CODE_ADMIN_PAYMENT_LOG')">
            <div class="toolbar">
              <a-select
                v-model:value="payStatus"
                :placeholder="t('TXT_CODE_ADMIN_STATUS_FILTER')"
                allow-clear
                style="width: 160px"
                @change="searchPayment"
              >
                <a-select-option v-for="(value, label) in {
                  [OrderStatus.PAID]: t('TXT_CODE_ORDER_STATUS_PAID'),
                  [OrderStatus.PROVISIONING]: t('TXT_CODE_ORDER_STATUS_PROVISIONING'),
                  [OrderStatus.COMPLETED]: t('TXT_CODE_ORDER_STATUS_COMPLETED'),
                  [OrderStatus.FAILED]: t('TXT_CODE_ORDER_STATUS_FAILED'),
                  [OrderStatus.REFUNDED]: t('TXT_CODE_ORDER_STATUS_REFUNDED')
                }" :key="String(value)" :value="Number(value)">
                  {{ label }}
                </a-select-option>
              </a-select>
              <a-button type="primary" @click="searchPayment">
                {{ t("TXT_CODE_31e92ef3") }}
              </a-button>
              <a-button @click="exportPayments">
                {{ t("TXT_CODE_ADMIN_LOG_EXPORT") }}
              </a-button>
            </div>
            <a-table
              :data-source="paymentLogs"
              :loading="payLoading"
              :pagination="{
                current: payPage,
                pageSize: payPageSize,
                total: payTotal,
                showSizeChanger: true
              }"
              row-key="uuid"
              size="middle"
              @change="(pagination: any) => {
                payPage = pagination.current || 1;
                payPageSize = pagination.pageSize || 20;
                loadPayments();
              }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'amount'">
                  {{ record.currency }} {{ formatMoney(record.amount) }}
                </template>
                <template v-else-if="column.key === 'status'">
                  <a-tag>{{ paymentStatusLabel(record.status) }}</a-tag>
                </template>
                <template v-else-if="column.key === 'type'">
                  {{ paymentTypeLabel(record.type) }}
                </template>
                <template v-else-if="column.key === 'payTime'">
                  {{ formatTime(record.payTime) }}
                </template>
              </template>
              <a-table-column key="uuid" title="ID" data-index="uuid" width="180" />
              <a-table-column key="userName" :title="t('TXT_CODE_ADMIN_USERNAME')" data-index="userName" />
              <a-table-column key="subject" :title="t('TXT_CODE_ORDER_SUBJECT')" data-index="subject" />
              <a-table-column key="type" :title="t('TXT_CODE_ADMIN_ORDER_TYPE')" align="center" />
              <a-table-column key="amount" :title="t('TXT_CODE_ORDER_AMOUNT')" align="right" />
              <a-table-column key="payGateway" :title="t('TXT_CODE_ADMIN_PAY_GATEWAY')" data-index="payGateway" />
              <a-table-column key="status" :title="t('TXT_CODE_ORDER_STATUS')" align="center" />
              <a-table-column key="payTime" :title="t('TXT_CODE_ADMIN_PAY_TIME')" />
            </a-table>
          </a-tab-pane>
        </a-tabs>
      </template>
    </CardPanel>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.logs-page {
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
}
</style>
