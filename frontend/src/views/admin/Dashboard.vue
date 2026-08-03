<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import {
  getDashboardStats,
  getRegistrationTrend,
  getRevenueTrend
} from "@/services/apis/adminDashboard";
import { reportErrorMsg } from "@/tools/validator";
import type { DashboardStats, TrendPoint } from "@/types/business";
import * as echarts from "echarts";
import { onMounted, onUnmounted, ref } from "vue";

const { execute: fetchStats, state: statsState, isLoading } = getDashboardStats();
const { execute: fetchRevenue, state: revenueState } = getRevenueTrend();
const { execute: fetchRegistrations, state: registrationState } = getRegistrationTrend();

const stats = ref<DashboardStats | null>(null);
const days = ref(30);

let revenueChart: echarts.ECharts | null = null;
let registrationChart: echarts.ECharts | null = null;

const currency = ref("CNY");

const renderRevenueChart = (data: TrendPoint[]) => {
  const el = document.getElementById("revenue-chart");
  if (!el) return;
  if (!revenueChart) revenueChart = echarts.init(el);
  revenueChart.setOption({
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: { type: "category", data: data.map((item) => item.date) },
    yAxis: { type: "value" },
    series: [
      {
        name: t("TXT_CODE_ADMIN_REVENUE"),
        type: "line",
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: data.map((item) => Number(item.amount || 0) / 100)
      }
    ]
  });
};

const renderRegistrationChart = (data: TrendPoint[]) => {
  const el = document.getElementById("registration-chart");
  if (!el) return;
  if (!registrationChart) registrationChart = echarts.init(el);
  registrationChart.setOption({
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: { type: "category", data: data.map((item) => item.date) },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        name: t("TXT_CODE_ADMIN_REGISTRATIONS"),
        type: "bar",
        data: data.map((item) => Number(item.count || 0))
      }
    ]
  });
};

const load = async () => {
  await fetchStats({ forceRequest: true });
  stats.value = statsState.value || null;
  currency.value = stats.value?.orders ? "CNY" : "CNY";
  await fetchRevenue({
    params: { days: days.value },
    forceRequest: true
  });
  await fetchRegistrations({
    params: { days: days.value },
    forceRequest: true
  });
  renderRevenueChart(revenueState.value || []);
  renderRegistrationChart(registrationState.value || []);
};

const onDaysChange = () => {
  load();
};

const formatMoney = (value: number) => `${currency.value} ${(Number(value) / 100).toFixed(2)}`;

const resize = () => {
  revenueChart?.resize();
  registrationChart?.resize();
};

onMounted(() => {
  window.addEventListener("resize", resize);
  load().catch(reportErrorMsg);
});

onUnmounted(() => {
  window.removeEventListener("resize", resize);
  revenueChart?.dispose();
  registrationChart?.dispose();
});
</script>

<template>
  <div class="dashboard-page">
    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :sm="12" :md="8" :lg="6">
        <CardPanel>
          <template #body>
            <div class="stat-card">
              <div class="stat-title">{{ t("TXT_CODE_ADMIN_STAT_TOTAL_USERS") }}</div>
              <div class="stat-value">{{ stats?.users.total ?? 0 }}</div>
              <div class="stat-sub">
                {{ t("TXT_CODE_ADMIN_STAT_NEW_TODAY") }}: {{ stats?.users.newToday ?? 0 }}
                /
                {{ t("TXT_CODE_ADMIN_STAT_NEW_MONTH") }}: {{ stats?.users.newThisMonth ?? 0 }}
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
      <a-col :xs="24" :sm="12" :md="8" :lg="6">
        <CardPanel>
          <template #body>
            <div class="stat-card">
              <div class="stat-title">{{ t("TXT_CODE_ADMIN_STAT_ACTIVE_USERS") }}</div>
              <div class="stat-value">{{ stats?.users.active ?? 0 }}</div>
              <div class="stat-sub">
                {{ t("TXT_CODE_ADMIN_STAT_PENDING") }}: {{ stats?.users.pendingVerify ?? 0 }}
                /
                {{ t("TXT_CODE_ADMIN_STAT_SUSPENDED") }}: {{ stats?.users.suspended ?? 0 }}
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
      <a-col :xs="24" :sm="12" :md="8" :lg="6">
        <CardPanel>
          <template #body>
            <div class="stat-card">
              <div class="stat-title">{{ t("TXT_CODE_ADMIN_STAT_INSTANCES") }}</div>
              <div class="stat-value">{{ stats?.instances.total ?? 0 }}</div>
              <div class="stat-sub">
                {{ t("TXT_CODE_ADMIN_STAT_RUNNING") }}: {{ stats?.instances.running ?? 0 }}
                /
                {{ t("TXT_CODE_ADMIN_STAT_STOPPED") }}: {{ stats?.instances.stopped ?? 0 }}
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
      <a-col :xs="24" :sm="12" :md="8" :lg="6">
        <CardPanel>
          <template #body>
            <div class="stat-card">
              <div class="stat-title">{{ t("TXT_CODE_ADMIN_STAT_REVENUE_TOTAL") }}</div>
              <div class="stat-value">{{ formatMoney(stats?.orders.revenueTotal ?? 0) }}</div>
              <div class="stat-sub">
                {{ t("TXT_CODE_ADMIN_STAT_REVENUE_TODAY") }}:
                {{ formatMoney(stats?.orders.revenueToday ?? 0) }}
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
      <a-col :xs="24" :sm="12" :md="8" :lg="6">
        <CardPanel>
          <template #body>
            <div class="stat-card">
              <div class="stat-title">{{ t("TXT_CODE_ADMIN_STAT_ORDERS") }}</div>
              <div class="stat-value">{{ stats?.orders.total ?? 0 }}</div>
              <div class="stat-sub">
                {{ t("TXT_CODE_ADMIN_STAT_PENDING_ORDERS") }}: {{ stats?.orders.pending ?? 0 }}
                /
                {{ t("TXT_CODE_ADMIN_STAT_COMPLETED_ORDERS") }}: {{ stats?.orders.completed ?? 0 }}
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
      <a-col :xs="24" :sm="12" :md="8" :lg="6">
        <CardPanel>
          <template #body>
            <div class="stat-card">
              <div class="stat-title">{{ t("TXT_CODE_ADMIN_STAT_SUBSCRIPTIONS") }}</div>
              <div class="stat-value">{{ stats?.subscriptions.active ?? 0 }}</div>
              <div class="stat-sub">
                {{ t("TXT_CODE_ADMIN_STAT_PAST_DUE") }}: {{ stats?.subscriptions.pastDue ?? 0 }}
                /
                {{ t("TXT_CODE_ADMIN_STAT_EXPIRING") }}: {{ stats?.subscriptions.expiringSoon ?? 0 }}
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
      <a-col :xs="24" :sm="12" :md="8" :lg="6">
        <CardPanel>
          <template #body>
            <div class="stat-card">
              <div class="stat-title">{{ t("TXT_CODE_ADMIN_STAT_NODES") }}</div>
              <div class="stat-value">{{ stats?.nodes.online ?? 0 }} / {{ stats?.nodes.total ?? 0 }}</div>
              <div class="stat-sub">
                {{ t("TXT_CODE_ADMIN_STAT_OFFLINE_NODES") }}: {{ stats?.nodes.offline ?? 0 }}
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
    </a-row>

    <a-row :gutter="[16, 16]" style="margin-top: 16px">
      <a-col :span="24">
        <CardPanel>
          <template #title>
            <a-space>
              <span>{{ t("TXT_CODE_ADMIN_REVENUE_TREND") }}</span>
              <a-select v-model:value="days" style="width: 120px" size="small" @change="onDaysChange">
                <a-select-option :value="7">7 {{ t("TXT_CODE_ADMIN_DAYS") }}</a-select-option>
                <a-select-option :value="30">30 {{ t("TXT_CODE_ADMIN_DAYS") }}</a-select-option>
                <a-select-option :value="90">90 {{ t("TXT_CODE_ADMIN_DAYS") }}</a-select-option>
              </a-select>
            </a-space>
          </template>
          <template #body>
            <div id="revenue-chart" class="chart" />
          </template>
        </CardPanel>
      </a-col>
      <a-col :span="24">
        <CardPanel>
          <template #title>
            <span>{{ t("TXT_CODE_ADMIN_REGISTRATION_TREND") }}</span>
          </template>
          <template #body>
            <div id="registration-chart" class="chart" />
          </template>
        </CardPanel>
      </a-col>
    </a-row>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.dashboard-page {
  .stat-card {
    .stat-title {
      color: var(--text-color-secondary);
      font-size: 14px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 600;
      margin: 4px 0;
    }

    .stat-sub {
      color: var(--text-color-secondary);
      font-size: 12px;
    }
  }

  .chart {
    width: 100%;
    height: 300px;
  }
}
</style>
