<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import { listAdminNodes, syncAdminNode, updateAdminNode } from "@/services/apis/adminNode";
import { reportErrorMsg } from "@/tools/validator";
import type { AdminNode } from "@/types/business";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchNodes, state: nodeState, isLoading } = listAdminNodes();
const { execute: submitUpdate } = updateAdminNode();
const { execute: submitSync } = syncAdminNode();

const nodes = ref<AdminNode[]>([]);

const editModalVisible = ref(false);
const editTarget = ref<AdminNode | null>(null);
const editForm = ref({ ip: "", port: 24444, remarks: "", apiKey: "", prefix: "" });

const loadNodes = async () => {
  await fetchNodes({ forceRequest: true });
  nodes.value = nodeState.value || [];
};

const openEdit = (node: AdminNode) => {
  editTarget.value = node;
  editForm.value = {
    ip: node.ip,
    port: node.port,
    remarks: node.remarks,
    apiKey: "",
    prefix: node.prefix
  };
  editModalVisible.value = true;
};

const submitEdit = async () => {
  if (!editTarget.value) return;
  try {
    await submitUpdate({
      params: { uuid: editTarget.value.uuid },
      data: {
        ip: editForm.value.ip,
        port: editForm.value.port,
        remarks: editForm.value.remarks,
        apiKey: editForm.value.apiKey || undefined,
        prefix: editForm.value.prefix
      },
      url: `/api/admin/nodes/${editTarget.value.uuid}`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    editModalVisible.value = false;
    loadNodes();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleSync = async (node: AdminNode) => {
  try {
    const result = await submitSync({
      params: { uuid: node.uuid },
      url: `/api/admin/nodes/${node.uuid}/sync`,
      forceRequest: true
    });
    message.success(
      t("TXT_CODE_ADMIN_NODE_SYNCED", { available: String(result.value?.available), count: String(result.value?.instanceCount) })
    );
    loadNodes();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const formatSize = (value: number) => {
  if (!value) return "0";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let size = Number(value);
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(1)} ${units[index]}`;
};

const cpuUsage = (node: AdminNode) => {
  const cpu = Number(node.info?.system?.cpu || 0);
  return cpu ? `${cpu} ${t("TXT_CODE_ADMIN_CORES")}` : "-";
};

const memUsage = (node: AdminNode) => {
  const total = Number(node.info?.system?.memTotal || 0);
  const free = Number(node.info?.system?.memFree || 0);
  return total ? formatSize(total) : "-";
};

const diskUsage = (node: AdminNode) => {
  const total = Number(node.info?.system?.diskTotal || 0);
  return total ? formatSize(total) : "-";
};

onMounted(() => {
  loadNodes();
});
</script>

<template>
  <div class="node-list-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ADMIN_NODES") }}</span>
      </template>
      <template #body>
        <a-table
          :data-source="nodes"
          :loading="isLoading"
          :pagination="false"
          row-key="uuid"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'available'">
              <a-tag :color="record.available ? 'green' : 'red'">
                {{ record.available ? t("TXT_CODE_ADMIN_NODE_ONLINE") : t("TXT_CODE_ADMIN_NODE_OFFLINE") }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'cpu'">
              {{ cpuUsage(record as AdminNode) }}
            </template>
            <template v-else-if="column.key === 'mem'">
              {{ memUsage(record as AdminNode) }}
            </template>
            <template v-else-if="column.key === 'disk'">
              {{ diskUsage(record as AdminNode) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openEdit(record as AdminNode)">
                  {{ t("TXT_CODE_ADMIN_EDIT") }}
                </a-button>
                <a-button size="small" type="primary" @click="handleSync(record as AdminNode)">
                  {{ t("TXT_CODE_ADMIN_NODE_SYNC") }}
                </a-button>
              </a-space>
            </template>
          </template>
          <a-table-column key="remarks" :title="t('TXT_CODE_ADMIN_NODE_REMARKS')" data-index="remarks" />
          <a-table-column key="ip" :title="t('TXT_CODE_ADMIN_NODE_IP')" data-index="ip" />
          <a-table-column key="port" :title="t('TXT_CODE_ADMIN_NODE_PORT')" data-index="port" />
          <a-table-column key="instanceCount" :title="t('TXT_CODE_ADMIN_NODE_INSTANCE_COUNT')" data-index="instanceCount" align="center" />
          <a-table-column key="cpu" :title="t('TXT_CODE_ADMIN_NODE_CPU')" />
          <a-table-column key="mem" :title="t('TXT_CODE_ADMIN_NODE_MEMORY')" />
          <a-table-column key="disk" :title="t('TXT_CODE_ADMIN_NODE_DISK')" />
          <a-table-column key="available" :title="t('TXT_CODE_ADMIN_STATUS')" align="center" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>

    <a-modal
      v-model:open="editModalVisible"
      :title="t('TXT_CODE_ADMIN_NODE_EDIT')"
      @ok="submitEdit"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('TXT_CODE_ADMIN_NODE_IP')">
          <a-input v-model:value="editForm.ip" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_ADMIN_NODE_PORT')">
          <a-input-number v-model:value="editForm.port" :min="1" :max="65535" style="width: 100%" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_ADMIN_NODE_REMARKS')">
          <a-input v-model:value="editForm.remarks" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_ADMIN_NODE_PREFIX')">
          <a-input v-model:value="editForm.prefix" />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_ADMIN_NODE_API_KEY')">
          <a-input v-model:value="editForm.apiKey" placeholder="******" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.node-list-page {
}
</style>
