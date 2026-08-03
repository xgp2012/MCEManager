<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import {
  cancelSubscription,
  listMySubscriptions,
  renewSubscription,
  setSubscriptionAutoRenew
} from "@/services/apis/subscription";
import { reportErrorMsg } from "@/tools/validator";
import type { Subscription } from "@/types/business";
import {
  BillingCycle as BillingCycleEnum,
  PlanType as PlanTypeEnum,
  SubscriptionStatus as SubscriptionStatusEnum
} from "@/types/business";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchSubscriptions, state: subscriptionsState, isLoading } =
  listMySubscriptions();
const { execute: submitRenew } = renewSubscription();
const { execute: submitCancel } = cancelSubscription();
const { execute: submitAutoRenew } = setSubscriptionAutoRenew();

const subscriptions = ref<Subscription[]>([]);
const balance = ref(0);
const renewingUuid = ref("");
const cancellingUuid = ref("");

const statusLabel = (status: number) => {
  switch (status) {
    case SubscriptionStatusEnum.ACTIVE:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_ACTIVE");
    case SubscriptionStatusEnum.PAST_DUE:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_PAST_DUE");
    case SubscriptionStatusEnum.CANCELLED:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_CANCELLED");
    case SubscriptionStatusEnum.EXPIRED:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_EXPIRED");
    default:
      return "-";
  }
};

const statusTagColor = (status: number) => {
  switch (status) {
    case SubscriptionStatusEnum.ACTIVE:
      return "green";
    case SubscriptionStatusEnum.PAST_DUE:
      return "red";
    case SubscriptionStatusEnum.CANCELLED:
      return "orange";
    case SubscriptionStatusEnum.EXPIRED:
      return "default";
    default:
      return "default";
  }
};

const cycleLabel = (value: number) => {
  switch (value) {
    case BillingCycleEnum.MONTHLY:
      return t("TXT_CODE_PLAN_CYCLE_MONTHLY");
    case BillingCycleEnum.QUARTERLY:
      return t("TXT_CODE_PLAN_CYCLE_QUARTERLY");
    case BillingCycleEnum.YEARLY:
      return t("TXT_CODE_PLAN_CYCLE_YEARLY");
    default:
      return t("TXT_CODE_PLAN_CYCLE_ONCE");
  }
};

const planTypeLabel = (value: number) => {
  switch (value) {
    case PlanTypeEnum.INSTANCE:
      return t("TXT_CODE_PLAN_TYPE_INSTANCE");
    case PlanTypeEnum.TEMPLATE:
      return t("TXT_CODE_PLAN_TYPE_TEMPLATE");
    default:
      return t("TXT_CODE_PLAN_TYPE_CUSTOM");
  }
};

const formatTime = (ms: number) => {
  if (!ms) return "-";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
};

const load = async () => {
  await fetchSubscriptions({ forceRequest: true });
  subscriptions.value = subscriptionsState.value?.list || [];
  balance.value = subscriptionsState.value?.balance || 0;
};

const toggleAutoRenew = async (sub: Subscription, enabled: boolean) => {
  try {
    await submitAutoRenew({
      params: { uuid: sub.uuid },
      data: { enabled },
      url: `/api/subscription/${sub.uuid}/auto-renew`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_SUBSCRIPTION_AUTO_RENEW_MSG"));
    await load();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleRenew = async (sub: Subscription) => {
  renewingUuid.value = sub.uuid;
  try {
    const result = await submitRenew({
      params: { uuid: sub.uuid },
      url: `/api/subscription/${sub.uuid}/renew`,
      forceRequest: true
    });
    const data = result.value;
    if (data?.paidByBalance) {
      message.success(t("TXT_CODE_SUBSCRIPTION_RENEWED_MSG"));
    } else if (data?.payUrl) {
      message.success(t("TXT_CODE_SUBSCRIPTION_RENEW_ORDER_MSG"));
      window.open(data.payUrl, "_blank");
    }
    await load();
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    renewingUuid.value = "";
  }
};

const handleCancel = (sub: Subscription) => {
  cancelSubscriptionModal.value = sub;
};

const confirmCancel = async () => {
  const sub = cancelSubscriptionModal.value;
  if (!sub) return;
  cancellingUuid.value = sub.uuid;
  try {
    await submitCancel({
      params: { uuid: sub.uuid },
      url: `/api/subscription/${sub.uuid}/cancel`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_SUBSCRIPTION_CANCEL_MSG"));
    cancelSubscriptionModal.value = null;
    await load();
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    cancellingUuid.value = "";
  }
};

const cancelSubscriptionModal = ref<Subscription | null>(null);

onMounted(() => {
  load();
});
</script>

<template>
  <div class="subscription-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_SUBSCRIPTION_MANAGEMENT") }}</span>
      </template>
      <template #body>
        <div class="balance-bar">
          <span class="balance-label">{{ t("TXT_CODE_USER_BALANCE") }}:</span>
          <span class="balance-amount">¥{{ (balance / 100).toFixed(2) }}</span>
        </div>

        <a-spin :spinning="isLoading">
          <a-table
            v-if="subscriptions.length > 0"
            :data-source="subscriptions"
            :pagination="false"
            row-key="uuid"
          >
            <a-table-column title="UUID" data-index="uuid" width="120" :ellipsis="true" />
            <a-table-column key="plan" :title="t('TXT_CODE_SUBSCRIPTION_PLAN')" width="160">
              <template #default="{ record }">
                {{ record.planName }}
                <a-tag>{{ cycleLabel(record.planCycle) }}</a-tag>
                <a-tag v-if="record.planType === PlanTypeEnum.TEMPLATE">
                  {{ planTypeLabel(record.planType) }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column :title="t('TXT_CODE_SUBSCRIPTION_INSTANCE')" data-index="instanceUuid" width="120" :ellipsis="true" />
            <a-table-column key="status" :title="t('TXT_CODE_SUBSCRIPTION_STATUS')" width="100">
              <template #default="{ record }">
                <a-tag :color="statusTagColor(record.status)">
                  {{ statusLabel(record.status) }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column key="period" :title="t('TXT_CODE_SUBSCRIPTION_PERIOD')" width="240">
              <template #default="{ record }">
                {{ formatTime(record.currentPeriodStart) }}
                ~
                {{ formatTime(record.currentPeriodEnd) }}
              </template>
            </a-table-column>
            <a-table-column key="autoRenew" :title="t('TXT_CODE_SUBSCRIPTION_AUTO_RENEW')" width="120">
              <template #default="{ record }">
                <a-switch
                  :checked="record.autoRenew"
                  :disabled="record.status === SubscriptionStatusEnum.EXPIRED"
                  @change="toggleAutoRenew(record, Boolean($event))"
                />
              </template>
            </a-table-column>
            <a-table-column key="actions" :title="t('TXT_CODE_OPERATE')" width="180">
              <template #default="{ record }">
                <a-button
                  type="link"
                  :loading="renewingUuid === record.uuid"
                  :disabled="record.status === SubscriptionStatusEnum.EXPIRED"
                  @click="handleRenew(record)"
                >
                  {{ t("TXT_CODE_SUBSCRIPTION_RENEW") }}
                </a-button>
                <a-button
                  v-if="record.status !== SubscriptionStatusEnum.CANCELLED && record.status !== SubscriptionStatusEnum.EXPIRED"
                  type="link"
                  danger
                  :loading="cancellingUuid === record.uuid"
                  @click="handleCancel(record)"
                >
                  {{ t("TXT_CODE_SUBSCRIPTION_CANCEL") }}
                </a-button>
              </template>
            </a-table-column>
          </a-table>
          <a-empty v-else :description="t('TXT_CODE_SUBSCRIPTION_EMPTY')" />
        </a-spin>
      </template>
    </CardPanel>

    <a-modal
      :open="!!cancelSubscriptionModal"
      :title="t('TXT_CODE_SUBSCRIPTION_CANCEL')"
      :ok-text="t('TXT_CODE_SUBSCRIPTION_CANCEL')"
      :cancel-text="t('TXT_CODE_SHOP_CANCEL')"
      :confirm-loading="!!cancellingUuid"
      @ok="confirmCancel"
      @cancel="cancelSubscriptionModal = null"
    >
      <p>{{ t("TXT_CODE_SUBSCRIPTION_CANCEL_CONFIRM") }}</p>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.subscription-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;

  .balance-bar {
    margin-bottom: 16px;
    display: flex;
    align-items: center;

    .balance-label {
      color: var(--text-color-secondary);
      margin-right: 8px;
    }

    .balance-amount {
      font-size: 18px;
      font-weight: 600;
      color: var(--success-color);
    }
  }
}
</style>
