<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import {
  forceCancelSubscription,
  listAdminSubscriptions,
  renewSubscriptionNow,
  setAdminSubscriptionAutoRenew
} from "@/services/apis/adminSubscription";
import { reportErrorMsg } from "@/tools/validator";
import type { AdminSubscription } from "@/types/business";
import { BillingCycle, SubscriptionStatus } from "@/types/business";
import { message, Modal } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchSubscriptions, state: pageState, isLoading } = listAdminSubscriptions();
const { execute: submitForceCancel } = forceCancelSubscription();
const { execute: submitRenewNow } = renewSubscriptionNow();
const { execute: submitAutoRenew } = setAdminSubscriptionAutoRenew();

const subscriptions = ref<AdminSubscription[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref("");
const statusFilter = ref<number | undefined>(undefined);

const statusOptions = [
  { value: SubscriptionStatus.ACTIVE, label: t("TXT_CODE_SUBSCRIPTION_STATUS_ACTIVE") },
  { value: SubscriptionStatus.PAST_DUE, label: t("TXT_CODE_SUBSCRIPTION_STATUS_PAST_DUE") },
  { value: SubscriptionStatus.CANCELLED, label: t("TXT_CODE_SUBSCRIPTION_STATUS_CANCELLED") },
  { value: SubscriptionStatus.EXPIRED, label: t("TXT_CODE_SUBSCRIPTION_STATUS_EXPIRED") }
];

const statusLabel = (status: number) =>
  statusOptions.find((item) => item.value === status)?.label || String(status);

const statusColor = (status: number) => {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
      return "green";
    case SubscriptionStatus.PAST_DUE:
      return "orange";
    case SubscriptionStatus.CANCELLED:
      return "default";
    default:
      return "red";
  }
};

const cycleLabel = (cycle: number) => {
  switch (cycle) {
    case BillingCycle.ONCE:
      return t("TXT_CODE_PLAN_CYCLE_ONCE");
    case BillingCycle.MONTHLY:
      return t("TXT_CODE_PLAN_CYCLE_MONTHLY");
    case BillingCycle.QUARTERLY:
      return t("TXT_CODE_PLAN_CYCLE_QUARTERLY");
    case BillingCycle.YEARLY:
      return t("TXT_CODE_PLAN_CYCLE_YEARLY");
    default:
      return String(cycle);
  }
};

const loadSubscriptions = async () => {
  await fetchSubscriptions({
    params: {
      page: page.value,
      page_size: pageSize.value,
      status: statusFilter.value,
      keyword: keyword.value || undefined
    },
    forceRequest: true
  });
  subscriptions.value = pageState.value?.data || [];
  total.value = pageState.value?.total || 0;
};

const handleSearch = () => {
  page.value = 1;
  loadSubscriptions();
};

const handleForceCancel = (sub: AdminSubscription) => {
  Modal.confirm({
    title: t("TXT_CODE_ADMIN_SUBSCRIPTION_FORCE_CANCEL_CONFIRM"),
    okText: t("TXT_CODE_31e92ef3"),
    cancelText: t("TXT_CODE_3b1cc020"),
    okType: "danger",
    onOk: async () => {
      try {
        await submitForceCancel({
          params: { uuid: sub.uuid },
          url: `/api/admin/subscriptions/${sub.uuid}/force-cancel`,
          forceRequest: true
        });
        message.success(t("TXT_CODE_7f0c746d"));
        loadSubscriptions();
      } catch (error: any) {
        reportErrorMsg(error);
      }
    }
  });
};

const handleRenewNow = async (sub: AdminSubscription) => {
  try {
    const result = await submitRenewNow({
      params: { uuid: sub.uuid },
      url: `/api/admin/subscriptions/${sub.uuid}/renew-now`,
      forceRequest: true
    });
    if (result.value?.paidByBalance) {
      message.success(t("TXT_CODE_ADMIN_SUBSCRIPTION_RENEWED_BY_BALANCE"));
    } else if (result.value?.payUrl) {
      Modal.info({
        title: t("TXT_CODE_ADMIN_SUBSCRIPTION_RENEW_PAY"),
        content: t("TXT_CODE_ADMIN_SUBSCRIPTION_RENEW_PAY_LINK"),
        onOk: () => window.open(result.value?.payUrl, "_blank")
      });
    }
    loadSubscriptions();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleAutoRenew = async (sub: AdminSubscription, enabled: boolean) => {
  try {
    await submitAutoRenew({
      params: { uuid: sub.uuid },
      data: { enabled },
      url: `/api/admin/subscriptions/${sub.uuid}/auto-renew`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadSubscriptions();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const formatTime = (value: string | number) => {
  if (!value) return "-";
  const date = new Date(value);
  return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const formatMoney = (value: number) => `¥ ${(Number(value) / 100).toFixed(2)}`;

onMounted(() => {
  loadSubscriptions();
});
</script>

<template>
  <div class="subscription-list-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ADMIN_SUBSCRIPTIONS") }}</span>
      </template>
      <template #body>
        <div class="toolbar">
          <a-input
            v-model:value="keyword"
            :placeholder="t('TXT_CODE_ADMIN_SUBSCRIPTION_SEARCH_PLACEHOLDER')"
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
          <a-button type="primary" @click="handleSearch">
            {{ t("TXT_CODE_31e92ef3") }}
          </a-button>
        </div>

        <a-table
          :data-source="subscriptions"
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
            loadSubscriptions();
          }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            </template>
            <template v-else-if="column.key === 'planCycle'">
              {{ cycleLabel(record.planCycle) }}
            </template>
            <template v-else-if="column.key === 'currentPeriodEnd'">
              {{ formatTime(record.currentPeriodEnd) }}
            </template>
            <template v-else-if="column.key === 'autoRenew'">
              <a-switch
                :checked="record.autoRenew"
                @change="(checked: any) => handleAutoRenew(record as AdminSubscription, Boolean(checked))"
              />
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button
                  v-if="record.status === SubscriptionStatus.ACTIVE || record.status === SubscriptionStatus.PAST_DUE"
                  size="small"
                  type="primary"
                  @click="handleRenewNow(record as AdminSubscription)"
                >
                  {{ t("TXT_CODE_ADMIN_SUBSCRIPTION_RENEW_NOW") }}
                </a-button>
                <a-button
                  v-if="record.status === SubscriptionStatus.ACTIVE || record.status === SubscriptionStatus.PAST_DUE"
                  size="small"
                  danger
                  @click="handleForceCancel(record as AdminSubscription)"
                >
                  {{ t("TXT_CODE_ADMIN_SUBSCRIPTION_FORCE_CANCEL") }}
                </a-button>
              </a-space>
            </template>
          </template>
          <a-table-column key="uuid" title="ID" data-index="uuid" width="180" />
          <a-table-column key="userName" :title="t('TXT_CODE_ADMIN_USERNAME')" data-index="userName" />
          <a-table-column key="planName" :title="t('TXT_CODE_ADMIN_PLAN')" data-index="planName" />
          <a-table-column key="planCycle" :title="t('TXT_CODE_ADMIN_PLAN_CYCLE')" align="center" />
          <a-table-column key="status" :title="t('TXT_CODE_ADMIN_STATUS')" align="center" />
          <a-table-column key="currentPeriodEnd" :title="t('TXT_CODE_ADMIN_PERIOD_END')" />
          <a-table-column key="autoRenew" :title="t('TXT_CODE_ADMIN_AUTO_RENEW')" align="center" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.subscription-list-page {
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
}
</style>
