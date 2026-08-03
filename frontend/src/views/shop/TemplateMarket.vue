<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import { createOrder } from "@/services/apis/order";
import { getMarketTemplates, getTemplateCategories } from "@/services/apis/template";
import { reportErrorMsg } from "@/tools/validator";
import type { MarketTemplate, Plan } from "@/types/business";
import { BillingCycle as BillingCycleEnum } from "@/types/business";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchMarket, state: marketState, isLoading } = getMarketTemplates();
const { execute: submitCreate } = createOrder();

const templates = ref<MarketTemplate[]>([]);
const categories = ref<Array<{ value: number; label: string }>>([]);
const activeCategory = ref(0);
const selectedTemplate = ref<MarketTemplate | null>(null);
const selectedPlan = ref<Plan | null>(null);
const submitting = ref(false);

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

const load = async () => {
  await fetchMarket({
    forceRequest: true,
    params: activeCategory.value ? { category: activeCategory.value } : {}
  });
  templates.value = marketState.value || [];
};

const changeCategory = (value: number) => {
  activeCategory.value = value;
  load();
};

const openDetail = (tpl: MarketTemplate) => {
  selectedTemplate.value = tpl;
  selectedPlan.value = tpl.plans[0] || null;
};

const closeDetail = () => {
  if (submitting.value) return;
  selectedTemplate.value = null;
  selectedPlan.value = null;
};

const pickPlan = (plan: Plan) => {
  selectedPlan.value = plan;
};

const confirmBuy = async () => {
  const plan = selectedPlan.value;
  if (!plan) return;
  submitting.value = true;
  try {
    const result = await submitCreate({ data: { planUuid: plan.uuid }, forceRequest: true });
    if (result.value?.payUrl) {
      window.open(result.value.payUrl, "_blank");
      message.success(t("TXT_CODE_SHOP_ORDER_CREATED"));
      closeDetail();
    }
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    submitting.value = false;
  }
};

onMounted(async () => {
  // Reuse the existing public categories endpoint for the filter bar.
  const { execute: fetchCategories, state: categoriesState } = getTemplateCategories();
  await fetchCategories({ forceRequest: true });
  categories.value = categoriesState.value || [];
  load();
});
</script>

<template>
  <div class="market-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_TEMPLATE_MARKET") }}</span>
      </template>
      <template #body>
        <div class="category-bar">
          <a-radio-group :value="activeCategory" button-style="solid" @change="(e: any) => changeCategory(Number(e.target.value))">
            <a-radio-button :value="0">{{ t("TXT_CODE_TEMPLATE_CATEGORY_ALL") }}</a-radio-button>
            <a-radio-button v-for="cat in categories" :key="cat.value" :value="cat.value">
              {{ cat.label }}
            </a-radio-button>
          </a-radio-group>
        </div>

        <a-spin :spinning="isLoading">
          <div v-if="templates.length === 0" class="empty">
            <a-empty :description="t('TXT_CODE_TEMPLATE_MARKET_EMPTY')" />
          </div>
          <a-row :gutter="16">
            <a-col
              v-for="tpl in templates"
              :key="tpl.uuid"
              :xs="24"
              :sm="12"
              :md="8"
              :lg="6"
            >
              <div class="template-card" @click="openDetail(tpl)">
                <div class="template-icon">
                  <img v-if="tpl.iconUrl" :src="tpl.iconUrl" alt="" />
                  <span v-else class="placeholder">🧩</span>
                </div>
                <div class="template-name">
                  <a-typography-title :level="4" style="margin-bottom: 0">
                    {{ tpl.displayName || tpl.name }}
                  </a-typography-title>
                </div>
                <div class="template-desc">{{ tpl.description }}</div>
                <div class="template-plans">
                  <a-tag v-for="plan in tpl.plans" :key="plan.uuid" color="blue">
                    {{ plan.name }} · ¥{{ (plan.price / 100).toFixed(2) }}
                  </a-tag>
                </div>
              </div>
            </a-col>
          </a-row>
        </a-spin>
      </template>
    </CardPanel>

    <a-modal
      :open="!!selectedTemplate"
      :title="t('TXT_CODE_TEMPLATE_MARKET_DETAIL')"
      :footer="null"
      :width="720"
      @cancel="closeDetail"
    >
      <template v-if="selectedTemplate">
        <div class="detail-header">
          <div class="detail-name">
            <a-typography-title :level="4" style="margin-bottom: 0">
              {{ selectedTemplate.displayName || selectedTemplate.name }}
            </a-typography-title>
          </div>
          <p class="detail-desc">{{ selectedTemplate.description }}</p>
          <p v-if="selectedTemplate.readme" class="detail-readme">{{ selectedTemplate.readme }}</p>
        </div>

        <div class="detail-plans">
          <div class="detail-plans-title">{{ t("TXT_CODE_TEMPLATE_PLANS") }}</div>
          <div
            v-for="plan in selectedTemplate.plans"
            :key="plan.uuid"
            class="plan-option"
            :class="{ active: selectedPlan?.uuid === plan.uuid }"
            @click="pickPlan(plan)"
          >
            <div class="plan-option-main">
              <div class="plan-option-name">{{ plan.name }}</div>
              <div class="plan-option-price">
                <span class="currency">¥</span>
                <span class="amount">{{ (plan.price / 100).toFixed(2) }}</span>
                <span class="cycle">{{ cycleLabel(plan.billingCycle) }}</span>
              </div>
            </div>
            <div class="plan-option-specs">
              <span v-if="plan.cpuLimit > 0">{{ t("TXT_CODE_PLAN_CPU") }}: {{ plan.cpuLimit }}</span>
              <span v-if="plan.memoryLimit > 0">{{ t("TXT_CODE_PLAN_MEMORY") }}: {{ plan.memoryLimit }}</span>
              <span v-if="plan.diskLimit > 0">{{ t("TXT_CODE_PLAN_DISK") }}: {{ plan.diskLimit }}</span>
            </div>
          </div>
        </div>

        <div class="detail-footer">
          <a-button
            type="primary"
            block
            :loading="submitting"
            :disabled="!selectedPlan"
            @click="confirmBuy"
          >
            {{ t("TXT_CODE_TEMPLATE_BUY") }}
          </a-button>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.market-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;

  .category-bar {
    margin-bottom: 16px;
  }

  .empty {
    padding: 48px 0;
  }

  .template-card {
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 16px;
    background-color: var(--background-color-white);
    cursor: pointer;
    transition: box-shadow 0.2s ease;

    &:hover {
      box-shadow: var(--card-shadow);
    }

    .template-icon {
      text-align: center;
      margin-bottom: 12px;

      img {
        max-width: 64px;
        max-height: 64px;
        object-fit: contain;
      }

      .placeholder {
        font-size: 48px;
        line-height: 1;
      }
    }

    .template-name {
      text-align: center;
      margin-bottom: 8px;
    }

    .template-desc {
      color: var(--text-color-secondary);
      font-size: 12px;
      min-height: 32px;
      margin-bottom: 12px;
    }

    .template-plans {
      text-align: center;
    }
  }

  .detail-header {
    margin-bottom: 16px;

    .detail-name {
      margin-bottom: 8px;
    }

    .detail-desc,
    .detail-readme {
      color: var(--text-color-secondary);
      font-size: 13px;
    }
  }

  .detail-plans {
    .detail-plans-title {
      font-weight: 600;
      margin-bottom: 8px;
    }

    .plan-option {
      border: 1px solid var(--card-border-color);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s ease;

      &.active {
        border-color: var(--primary-color);
        background-color: var(--primary-color-faded);
      }

      .plan-option-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;

        .plan-option-name {
          font-weight: 600;
        }

        .plan-option-price {
          .currency {
            font-size: 13px;
            margin-right: 2px;
          }

          .amount {
            font-size: 20px;
            font-weight: 700;
          }

          .cycle {
            margin-left: 6px;
            color: var(--text-color-secondary);
          }
        }
      }

      .plan-option-specs {
        display: flex;
        gap: 16px;
        color: var(--text-color-secondary);
        font-size: 12px;
      }
    }
  }

  .detail-footer {
    margin-top: 16px;
  }
}
</style>
