<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import {
  createPlan,
  deletePlan,
  listPlans,
  updatePlan,
  updatePlanStatus
} from "@/services/apis/plan";
import { reportErrorMsg } from "@/tools/validator";
import type { Plan } from "@/types/business";
import {
  BillingCycle as BillingCycleEnum,
  PlanType as PlanTypeEnum
} from "@/types/business";
import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  ReloadOutlined
} from "@ant-design/icons-vue";
import { message, Modal } from "ant-design-vue";
import { onMounted, reactive, ref } from "vue";

const { execute: fetchPlans, state: pageState, isLoading } = listPlans();
const { execute: submitCreate } = createPlan();
const { execute: submitUpdate } = updatePlan();
const { execute: submitDelete } = deletePlan();
const { execute: submitStatus } = updatePlanStatus();

const planList = ref<Plan[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref("");

const typeOptions = [
  { value: PlanTypeEnum.INSTANCE, label: t("TXT_CODE_PLAN_TYPE_INSTANCE") },
  { value: PlanTypeEnum.TEMPLATE, label: t("TXT_CODE_PLAN_TYPE_TEMPLATE") },
  { value: PlanTypeEnum.CUSTOM, label: t("TXT_CODE_PLAN_TYPE_CUSTOM") }
];
const cycleOptions = [
  { value: BillingCycleEnum.ONCE, label: t("TXT_CODE_PLAN_CYCLE_ONCE") },
  { value: BillingCycleEnum.MONTHLY, label: t("TXT_CODE_PLAN_CYCLE_MONTHLY") },
  { value: BillingCycleEnum.QUARTERLY, label: t("TXT_CODE_PLAN_CYCLE_QUARTERLY") },
  { value: BillingCycleEnum.YEARLY, label: t("TXT_CODE_PLAN_CYCLE_YEARLY") }
];

const planTypeLabel = (value: number) =>
  typeOptions.find((item) => item.value === value)?.label || String(value);
const cycleLabel = (value: number) =>
  cycleOptions.find((item) => item.value === value)?.label || String(value);

const loadPlans = async () => {
  await fetchPlans({
    params: {
      page: page.value,
      page_size: pageSize.value,
      name: keyword.value || undefined
    },
    forceRequest: true
  });
  planList.value = pageState.value?.data || [];
  total.value = pageState.value?.total || 0;
};

const handleSearch = () => {
  page.value = 1;
  loadPlans();
};

const handleToggle = async (plan: Plan) => {
  try {
    await submitStatus({
      params: { uuid: plan.uuid },
      data: { enabled: !plan.enabled },
      url: `/api/plan/${plan.uuid}/status`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadPlans();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleDelete = async (plan: Plan) => {
  Modal.confirm({
    title: t("TXT_CODE_PLAN_DELETE_CONFIRM"),
    okText: t("TXT_CODE_31e92ef3"),
    cancelText: t("TXT_CODE_3b1cc020"),
    onOk: async () => {
      try {
        await submitDelete({
          params: { uuid: plan.uuid },
          url: `/api/plan/${plan.uuid}`,
          forceRequest: true
        });
        message.success(t("TXT_CODE_28190dbc"));
        loadPlans();
      } catch (error: any) {
        reportErrorMsg(error);
      }
    }
  });
};

const goBack = () => {
  router.push({ path: "/" });
};

const emptyPlan = (): Plan => ({
  uuid: "",
  name: "",
  description: "",
  type: PlanTypeEnum.INSTANCE,
  price: 0,
  billingCycle: BillingCycleEnum.ONCE,
  cpuLimit: 0,
  memoryLimit: 0,
  diskLimit: 0,
  uploadLimit: 0,
  downloadLimit: 0,
  templateUuid: "",
  daemonId: "",
  enabled: true,
  sortOrder: 0,
  createdAt: "",
  updatedAt: ""
});

const formVisible = ref(false);
const editing = ref(false);
const form = reactive<Plan>(emptyPlan());

const openCreate = () => {
  editing.value = false;
  Object.assign(form, emptyPlan());
  formVisible.value = true;
};

const openEdit = (plan: Plan) => {
  editing.value = true;
  Object.assign(form, JSON.parse(JSON.stringify(plan)));
  formVisible.value = true;
};

const submitForm = async () => {
  if (!form.name.trim()) {
    message.error(t("TXT_CODE_PLAN_NAME_REQUIRED"));
    return;
  }
  try {
    const payload: Partial<Plan> = { ...form };
    if (editing.value) {
      await submitUpdate({
        params: { uuid: form.uuid },
        data: payload,
        url: `/api/plan/${form.uuid}`,
        forceRequest: true
      });
    } else {
      await submitCreate({ data: payload, forceRequest: true });
    }
    message.success(t("TXT_CODE_7f0c746d"));
    formVisible.value = false;
    loadPlans();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

onMounted(() => {
  loadPlans();
});
</script>

<template>
  <div class="management-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_PLAN_MANAGEMENT") }}</span>
      </template>
      <template #body>
        <div class="toolbar">
          <a-input
            v-model:value="keyword"
            :placeholder="t('TXT_CODE_PLAN_NAME')"
            style="width: 240px"
            allow-clear
            @press-enter="handleSearch"
          />
          <a-button @click="handleSearch">
            <template #icon><ReloadOutlined /></template>
            {{ t("TXT_CODE_fe731dfc") }}
          </a-button>
          <div class="spacer" />
          <a-button @click="goBack">{{ t("TXT_CODE_3b1cc020") }}</a-button>
          <a-button type="primary" @click="openCreate">
            <template #icon><PlusOutlined /></template>
            {{ t("TXT_CODE_PLAN_CREATE") }}
          </a-button>
        </div>

        <a-table
          :data-source="planList"
          :loading="isLoading"
          :pagination="{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (n: number) => `${t('TXT_CODE_ORDER_TIME')}: ${n}`
          }"
          row-key="uuid"
          size="middle"
          @change="(pagination: any) => {
            page = pagination.current || 1;
            pageSize = pagination.pageSize || 10;
            loadPlans();
          }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'type'">
              {{ planTypeLabel(record.type) }}
            </template>
            <template v-else-if="column.key === 'cycle'">
              {{ cycleLabel(record.billingCycle) }}
            </template>
            <template v-else-if="column.key === 'enabled'">
              <a-tag :color="record.enabled ? 'green' : 'default'">
                <CheckOutlined v-if="record.enabled" />{{ t("TXT_CODE_PLAN_ENABLED") }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openEdit(record as Plan)">
                  {{ t("TXT_CODE_EDIT") }}
                </a-button>
                <a-button size="small" @click="handleToggle(record as Plan)">
                  <template #icon>
                    <CheckOutlined v-if="!record.enabled" />
                    <CloseOutlined v-else />
                  </template>
                  {{ record.enabled ? t("TXT_CODE_PLAN_DISABLE") : t("TXT_CODE_PLAN_ENABLE") }}
                </a-button>
                <a-button size="small" danger @click="handleDelete(record as Plan)">
                  {{ t("TXT_CODE_28190dbc") }}
                </a-button>
              </a-space>
            </template>
          </template>
          <a-table-column key="name" :title="t('TXT_CODE_PLAN_NAME')" data-index="name" />
          <a-table-column key="type" :title="t('TXT_CODE_PLAN_TYPE')" />
          <a-table-column key="price" :title="t('TXT_CODE_PLAN_PRICE')">
            <template #default="{ record }">
              {{ (record.price / 100).toFixed(2) }}
            </template>
          </a-table-column>
          <a-table-column key="cycle" :title="t('TXT_CODE_PLAN_CYCLE')" />
          <a-table-column
            key="cpu"
            :title="t('TXT_CODE_PLAN_CPU')"
            data-index="cpuLimit"
            align="center"
          />
          <a-table-column
            key="memory"
            :title="t('TXT_CODE_PLAN_MEMORY')"
            data-index="memoryLimit"
            align="center"
          />
          <a-table-column
            key="disk"
            :title="t('TXT_CODE_PLAN_DISK')"
            data-index="diskLimit"
            align="center"
          />
          <a-table-column
            key="upload"
            :title="t('TXT_CODE_PLAN_UPLOAD')"
            data-index="uploadLimit"
            align="center"
          />
          <a-table-column
            key="download"
            :title="t('TXT_CODE_PLAN_DOWNLOAD')"
            data-index="downloadLimit"
            align="center"
          />
          <a-table-column key="enabled" :title="t('TXT_CODE_PLAN_ENABLED')" align="center" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>

    <a-modal
      v-model:open="formVisible"
      :title="editing ? t('TXT_CODE_PLAN_EDIT') : t('TXT_CODE_PLAN_CREATE')"
      :ok-text="t('TXT_CODE_31e92ef3')"
      :cancel-text="t('TXT_CODE_3b1cc020')"
      @ok="submitForm"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('TXT_CODE_PLAN_NAME')" required>
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_PLAN_DESCRIPTION')">
          <a-textarea v-model:value="form.description" :rows="2" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_PLAN_TYPE')">
          <a-select v-model:value="form.type" :options="typeOptions" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_PLAN_PRICE')">
          <a-input-number v-model:value="form.price" :min="0" :precision="0" style="width: 100%" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_PLAN_CYCLE')">
          <a-select v-model:value="form.billingCycle" :options="cycleOptions" />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_CPU')">
              <a-input-number v-model:value="form.cpuLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_MEMORY')">
              <a-input-number v-model:value="form.memoryLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_DISK')">
              <a-input-number v-model:value="form.diskLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_UPLOAD')">
              <a-input-number v-model:value="form.uploadLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_DOWNLOAD')">
              <a-input-number v-model:value="form.downloadLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_ENABLED')">
              <a-switch v-model:checked="form.enabled" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.management-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;

    .spacer {
      flex: 1;
    }
  }
}
</style>
