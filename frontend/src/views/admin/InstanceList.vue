<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import {
  deleteAdminInstance,
  extendAdminInstance,
  listAdminInstances,
  resumeAdminInstance,
  suspendAdminInstance,
  updateAdminInstanceBandwidth
} from "@/services/apis/adminInstance";
import { reportErrorMsg } from "@/tools/validator";
import type { AdminInstance } from "@/types/business";
import { message, Modal } from "ant-design-vue";
import dayjs from "dayjs";
import { onMounted, ref } from "vue";

const { execute: fetchInstances, state: pageState, isLoading } = listAdminInstances();
const { execute: submitExtend } = extendAdminInstance();
const { execute: submitSuspend } = suspendAdminInstance();
const { execute: submitResume } = resumeAdminInstance();
const { execute: submitDelete } = deleteAdminInstance();
const { execute: submitBandwidth } = updateAdminInstanceBandwidth();

const instances = ref<AdminInstance[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref("");
const statusFilter = ref<number | undefined>(undefined);

const extendModalVisible = ref(false);
const extendTarget = ref<AdminInstance | null>(null);
const extendEndTime = ref<dayjs.Dayjs | undefined>(undefined);

const bandwidthModalVisible = ref(false);
const bandwidthTarget = ref<AdminInstance | null>(null);
const uploadLimit = ref(0);
const downloadLimit = ref(0);

const STATUS_RUNNING = 3;
const STATUS_STOP = 0;

const statusLabel = (status: number) => {
  switch (status) {
    case STATUS_RUNNING:
      return t("TXT_CODE_ADMIN_INSTANCE_STATUS_RUNNING");
    case STATUS_STOP:
      return t("TXT_CODE_ADMIN_INSTANCE_STATUS_STOPPED");
    default:
      return t("TXT_CODE_ADMIN_INSTANCE_STATUS_OTHER");
  }
};

const statusColor = (status: number) => {
  switch (status) {
    case STATUS_RUNNING:
      return "green";
    case STATUS_STOP:
      return "default";
    default:
      return "orange";
  }
};

const loadInstances = async () => {
  await fetchInstances({
    params: {
      page: page.value,
      page_size: pageSize.value,
      status: statusFilter.value,
      keyword: keyword.value || undefined
    },
    forceRequest: true
  });
  instances.value = pageState.value?.data || [];
  total.value = pageState.value?.total || 0;
};

const handleSearch = () => {
  page.value = 1;
  loadInstances();
};

const openExtendModal = (instance: AdminInstance) => {
  extendTarget.value = instance;
  const endTime = instance.config?.endTime;
  extendEndTime.value = endTime ? dayjs(Number(endTime)) : dayjs().add(1, "month");
  extendModalVisible.value = true;
};

const submitExtendTime = async () => {
  if (!extendTarget.value || !extendEndTime.value) return;
  try {
    await submitExtend({
      params: { uuid: extendTarget.value.instanceUuid },
      data: { endTime: extendEndTime.value.valueOf() },
      url: `/api/admin/instances/${extendTarget.value.instanceUuid}/extend?daemonId=${extendTarget.value.daemonId}`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    extendModalVisible.value = false;
    loadInstances();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleSuspend = async (instance: AdminInstance) => {
  try {
    await submitSuspend({
      params: { uuid: instance.instanceUuid },
      url: `/api/admin/instances/${instance.instanceUuid}/suspend?daemonId=${instance.daemonId}`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadInstances();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleResume = async (instance: AdminInstance) => {
  try {
    await submitResume({
      params: { uuid: instance.instanceUuid },
      url: `/api/admin/instances/${instance.instanceUuid}/resume?daemonId=${instance.daemonId}`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadInstances();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const openBandwidthModal = (instance: AdminInstance) => {
  bandwidthTarget.value = instance;
  const docker = instance.config?.docker || {};
  uploadLimit.value = Math.round(Number(docker.uploadSpeedLimit || 0) / 125);
  downloadLimit.value = Math.round(Number(docker.downloadSpeedLimit || 0) / 125);
  bandwidthModalVisible.value = true;
};

const submitBandwidthChange = async () => {
  if (!bandwidthTarget.value) return;
  try {
    await submitBandwidth({
      params: { uuid: bandwidthTarget.value.instanceUuid },
      data: {
        uploadLimit: Math.max(0, uploadLimit.value),
        downloadLimit: Math.max(0, downloadLimit.value)
      },
      url: `/api/admin/instances/${bandwidthTarget.value.instanceUuid}/bandwidth?daemonId=${bandwidthTarget.value.daemonId}`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    bandwidthModalVisible.value = false;
    loadInstances();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleDelete = (instance: AdminInstance) => {
  Modal.confirm({
    title: t("TXT_CODE_ADMIN_INSTANCE_DELETE_CONFIRM", { name: instance.config?.nickname }),
    okText: t("TXT_CODE_31e92ef3"),
    cancelText: t("TXT_CODE_3b1cc020"),
    okType: "danger",
    onOk: async () => {
      try {
        await submitDelete({
          params: { uuid: instance.instanceUuid },
          data: { deleteFile: false },
          url: `/api/admin/instances/${instance.instanceUuid}?daemonId=${instance.daemonId}`,
          forceRequest: true
        });
        message.success(t("TXT_CODE_28190dbc"));
        loadInstances();
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

onMounted(() => {
  loadInstances();
});
</script>

<template>
  <div class="instance-list-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ADMIN_INSTANCES") }}</span>
      </template>
      <template #body>
        <div class="toolbar">
          <a-input
            v-model:value="keyword"
            :placeholder="t('TXT_CODE_ADMIN_INSTANCE_SEARCH_PLACEHOLDER')"
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
            <a-select-option :value="STATUS_RUNNING">
              {{ t("TXT_CODE_ADMIN_INSTANCE_STATUS_RUNNING") }}
            </a-select-option>
            <a-select-option :value="STATUS_STOP">
              {{ t("TXT_CODE_ADMIN_INSTANCE_STATUS_STOPPED") }}
            </a-select-option>
          </a-select>
          <a-button type="primary" @click="handleSearch">
            {{ t("TXT_CODE_31e92ef3") }}
          </a-button>
        </div>

        <a-table
          :data-source="instances"
          :loading="isLoading"
          :pagination="{
            current: page,
            pageSize,
            total,
            showSizeChanger: true
          }"
          row-key="instanceUuid"
          size="middle"
          @change="(pagination: any) => {
            page = pagination.current || 1;
            pageSize = pagination.pageSize || 10;
            loadInstances();
          }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            </template>
            <template v-else-if="column.key === 'endTime'">
              {{ formatTime(record.config?.endTime) }}
            </template>
            <template v-else-if="column.key === 'daemon'">
              {{ record.daemonRemarks }} ({{ record.daemonIp }})
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openExtendModal(record as AdminInstance)">
                  {{ t("TXT_CODE_ADMIN_INSTANCE_EXTEND") }}
                </a-button>
                <a-button
                  v-if="record.status !== STATUS_STOP"
                  size="small"
                  danger
                  @click="handleSuspend(record as AdminInstance)"
                >
                  {{ t("TXT_CODE_ADMIN_INSTANCE_SUSPEND") }}
                </a-button>
                <a-button
                  v-else
                  size="small"
                  type="primary"
                  @click="handleResume(record as AdminInstance)"
                >
                  {{ t("TXT_CODE_ADMIN_INSTANCE_RESUME") }}
                </a-button>
                <a-button size="small" @click="openBandwidthModal(record as AdminInstance)">
                  {{ t("TXT_CODE_ADMIN_INSTANCE_BANDWIDTH") }}
                </a-button>
                <a-button size="small" danger @click="handleDelete(record as AdminInstance)">
                  {{ t("TXT_CODE_28190dbc") }}
                </a-button>
              </a-space>
            </template>
          </template>
          <a-table-column
            key="nickname"
            :title="t('TXT_CODE_ADMIN_INSTANCE_NAME')"
            data-index="nickname"
            width="160"
          />
          <a-table-column key="instanceUuid" title="UUID" data-index="instanceUuid" width="180" />
          <a-table-column key="status" :title="t('TXT_CODE_ADMIN_STATUS')" align="center" />
          <a-table-column key="daemon" :title="t('TXT_CODE_ADMIN_NODE')" />
          <a-table-column key="endTime" :title="t('TXT_CODE_ADMIN_END_TIME')" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>

    <a-modal
      v-model:open="extendModalVisible"
      :title="t('TXT_CODE_ADMIN_INSTANCE_EXTEND')"
      @ok="submitExtendTime"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('TXT_CODE_ADMIN_END_TIME')">
          <a-date-picker
            v-model:value="extendEndTime"
            show-time
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="bandwidthModalVisible"
      :title="t('TXT_CODE_ADMIN_INSTANCE_BANDWIDTH')"
      @ok="submitBandwidthChange"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('TXT_CODE_ADMIN_UPLOAD_LIMIT_MBPS')">
          <a-input-number v-model:value="uploadLimit" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_ADMIN_DOWNLOAD_LIMIT_MBPS')">
          <a-input-number v-model:value="downloadLimit" :min="0" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.instance-list-page {
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
}
</style>
