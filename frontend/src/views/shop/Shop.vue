<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { listPublicPlans } from "@/services/apis/plan";
import { createOrder } from "@/services/apis/order";
import { reportErrorMsg } from "@/tools/validator";
import type { Plan } from "@/types/business";
import {
  BillingCycle as BillingCycleEnum,
  PlanType as PlanTypeEnum
} from "@/types/business";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchPlans, state: plansState, isLoading } = listPublicPlans();
const { execute: submitCreate } = createOrder();

const plans = ref<Plan[]>([]);
const confirmPlan = ref<Plan | null>(null);
const submitting = ref(false);

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

const loadPlans = async () => {
  await fetchPlans({ forceRequest: true });
  plans.value = plansState.value || [];
};

const openConfirm = (plan: Plan) => {
  confirmPlan.value = plan;
};

const closeConfirm = () => {
  if (submitting.value) return;
  confirmPlan.value = null;
};

const confirmBuy = async () => {
  const plan = confirmPlan.value;
  if (!plan) return;
  submitting.value = true;
  try {
    const result = await submitCreate({ data: { planUuid: plan.uuid }, forceRequest: true });
    if (result.value?.payUrl) {
      window.open(result.value.payUrl, "_blank");
      message.success(t("TXT_CODE_SHOP_ORDER_CREATED"));
      closeConfirm();
    }
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    submitting.value = false;
  }
};

const goOrders = () => {
  router.push({ path: "/shop/orders" });
};

const goMarket = () => {
  router.push({ path: "/shop/market" });
};

const goSubscriptions = () => {
  router.push({ path: "/shop/subscriptions" });
};

onMounted(() => {
  loadPlans();
});
</script>

<template>
  <div class="shop-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_SHOP_TITLE") }}</span>
      </template>
      <template #body>
        <div class="nav-tabs">
          <a-segmented
            :value="t('TXT_CODE_SHOP_TABS_PLANS')"
            :options="[
              { label: t('TXT_CODE_SHOP_TABS_PLANS'), value: 'plans' },
              { label: t('TXT_CODE_SHOP_TABS_MARKET'), value: 'market' },
              { label: t('TXT_CODE_SHOP_TABS_ORDERS'), value: 'orders' },
              { label: t('TXT_CODE_SHOP_TABS_SUBSCRIPTIONS'), value: 'subscriptions' }
            ]"
            @change="(value: any) => {
              if (value === 'market') goMarket();
              else if (value === 'orders') goOrders();
              else if (value === 'subscriptions') goSubscriptions();
            }"
          />
        </div>

        <div class="toolbar">
          <div class="spacer" />
          <a-button @click="goOrders">{{ t("TXT_CODE_SHOP_GO_ORDERS") }}</a-button>
        </div>

        <a-spin :spinning="isLoading">
          <div v-if="plans.length === 0" class="empty">
            <a-empty :description="t('TXT_CODE_SHOP_NO_PLAN')" />
          </div>
          <a-row :gutter="16">
            <a-col v-for="plan in plans" :key="plan.uuid" :xs="24" :sm="12" :md="8" :lg="6">
              <div class="plan-card">
                <div class="plan-name">
                  <a-typography-title :level="4" style="margin-bottom: 0">
                    {{ plan.name }}
                  </a-typography-title>
                </div>
                <div class="plan-price">
                  <span class="currency">¥</span>
                  <span class="amount">{{ (plan.price / 100).toFixed(2) }}</span>
                  <span class="cycle">{{ cycleLabel(plan.billingCycle) }}</span>
                </div>
                <div class="plan-meta">
                  <div class="plan-type">
                    <a-tag>{{ planTypeLabel(plan.type) }}</a-tag>
                  </div>
                  <p v-if="plan.description" class="plan-desc">{{ plan.description }}</p>
                  <ul class="plan-specs">
                    <li v-if="plan.cpuLimit > 0">{{ t("TXT_CODE_PLAN_CPU") }}: {{ plan.cpuLimit }}</li>
                    <li v-if="plan.memoryLimit > 0">{{ t("TXT_CODE_PLAN_MEMORY") }}: {{ plan.memoryLimit }}</li>
                    <li v-if="plan.diskLimit > 0">{{ t("TXT_CODE_PLAN_DISK") }}: {{ plan.diskLimit }}</li>
                    <li v-if="plan.uploadLimit > 0">{{ t("TXT_CODE_PLAN_UPLOAD") }}: {{ plan.uploadLimit }}</li>
                    <li v-if="plan.downloadLimit > 0">{{ t("TXT_CODE_PLAN_DOWNLOAD") }}: {{ plan.downloadLimit }}</li>
                  </ul>
                </div>
                <a-button type="primary" block @click="openConfirm(plan)">
                  {{ t("TXT_CODE_SHOP_BUY") }}
                </a-button>
              </div>
            </a-col>
          </a-row>
        </a-spin>
      </template>
    </CardPanel>

    <a-modal
      :open="!!confirmPlan"
      :title="t('TXT_CODE_SHOP_CONFIRM_TITLE')"
      :ok-text="t('TXT_CODE_SHOP_CONFIRM')"
      :cancel-text="t('TXT_CODE_SHOP_CANCEL')"
      :confirm-loading="submitting"
      @ok="confirmBuy"
      @cancel="closeConfirm"
    >
      <template v-if="confirmPlan">
        <div class="confirm-summary">
          <div class="confirm-name">
            <a-typography-title :level="5" style="margin-bottom: 0">
              {{ confirmPlan.name }}
            </a-typography-title>
          </div>
          <div class="confirm-price">
            <span class="currency">¥</span>
            <span class="amount">{{ (confirmPlan.price / 100).toFixed(2) }}</span>
            <span class="cycle">{{ cycleLabel(confirmPlan.billingCycle) }}</span>
          </div>
          <ul class="plan-specs">
            <li v-if="confirmPlan.cpuLimit > 0">
              {{ t("TXT_CODE_PLAN_CPU") }}: {{ confirmPlan.cpuLimit }}
            </li>
            <li v-if="confirmPlan.memoryLimit > 0">
              {{ t("TXT_CODE_PLAN_MEMORY") }}: {{ confirmPlan.memoryLimit }}
            </li>
            <li v-if="confirmPlan.diskLimit > 0">
              {{ t("TXT_CODE_PLAN_DISK") }}: {{ confirmPlan.diskLimit }}
            </li>
            <li v-if="confirmPlan.uploadLimit > 0">
              {{ t("TXT_CODE_PLAN_UPLOAD") }}: {{ confirmPlan.uploadLimit }}
            </li>
            <li v-if="confirmPlan.downloadLimit > 0">
              {{ t("TXT_CODE_PLAN_DOWNLOAD") }}: {{ confirmPlan.downloadLimit }}
            </li>
          </ul>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.shop-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;

  .nav-tabs {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .toolbar {
    display: flex;
    align-items: center;
    margin-bottom: 16px;

    .spacer {
      flex: 1;
    }
  }

  .empty {
    padding: 48px 0;
  }

  .confirm-summary {
    .confirm-name {
      text-align: center;
      margin-bottom: 12px;
    }

    .confirm-price {
      text-align: center;
      margin-bottom: 12px;

      .currency {
        font-size: 16px;
        margin-right: 2px;
      }

      .amount {
        font-size: 28px;
        font-weight: 700;
      }

      .cycle {
        margin-left: 6px;
        color: var(--text-color-secondary);
      }
    }

    .plan-specs {
      list-style: none;
      padding: 0;
      margin: 0;

      li {
        padding: 4px 0;
        color: var(--text-color);
        border-bottom: 1px dashed var(--card-border-color);
      }
    }
  }

  .plan-card {
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
    background-color: var(--background-color-white);
    transition: box-shadow 0.2s ease;

    &:hover {
      box-shadow: var(--card-shadow);
    }

    .plan-name {
      text-align: center;
      margin-bottom: 12px;
    }

    .plan-price {
      text-align: center;
      margin-bottom: 12px;

      .currency {
        font-size: 16px;
        margin-right: 2px;
      }

      .amount {
        font-size: 32px;
        font-weight: 700;
      }

      .cycle {
        margin-left: 6px;
        color: var(--text-color-secondary);
      }
    }

    .plan-meta {
      .plan-type {
        text-align: center;
        margin-bottom: 8px;
      }

      .plan-desc {
        color: var(--text-color-secondary);
        font-size: 12px;
        min-height: 32px;
      }

      .plan-specs {
        list-style: none;
        padding: 0;
        margin: 0 0 16px;

        li {
          padding: 4px 0;
          color: var(--text-color);
        }
      }
    }
  }
}
</style>
