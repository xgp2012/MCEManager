<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import {
  cloneTemplate,
  createTemplate,
  deleteTemplate,
  exportTemplate,
  getTemplateCategories,
  importTemplate,
  listTemplates,
  updateTemplate,
  updateTemplateStatus
} from "@/services/apis/template";
import { reportErrorMsg } from "@/tools/validator";
import type { Template, TemplatePort, TemplateVolume } from "@/types/business";
import {
  TemplateCategory as TemplateCategoryEnum,
  TemplateType as TemplateTypeEnum
} from "@/types/business";
import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  ReloadOutlined
} from "@ant-design/icons-vue";
import { message, Modal } from "ant-design-vue";
import { onMounted, reactive, ref } from "vue";

const { execute: fetchTemplates, state: pageState, isLoading } = listTemplates();
const { execute: submitCreate } = createTemplate();
const { execute: submitUpdate } = updateTemplate();
const { execute: submitDelete } = deleteTemplate();
const { execute: submitStatus } = updateTemplateStatus();
const { execute: submitClone } = cloneTemplate();
const { execute: runImport } = importTemplate();
const { execute: submitExport } = exportTemplate();
const { execute: fetchCategories, state: categoriesState } = getTemplateCategories();

const templateList = ref<Template[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref("");

const typeOptions = [
  { value: TemplateTypeEnum.DOCKER, label: t("TXT_CODE_TEMPLATE_TYPE_DOCKER") },
  { value: TemplateTypeEnum.PROCESS, label: t("TXT_CODE_TEMPLATE_TYPE_PROCESS") }
];
const categoryOptions = ref<Array<{ value: number; label: string }>>([]);

const categoryLabel = (value: number) =>
  categoryOptions.value.find((item) => item.value === value)?.label || String(value);

const loadCategories = async () => {
  await fetchCategories({ forceRequest: true });
  categoryOptions.value = categoriesState.value || [];
};

const loadTemplates = async () => {
  await fetchTemplates({
    params: {
      page: page.value,
      page_size: pageSize.value,
      name: keyword.value || undefined
    },
    forceRequest: true
  });
  templateList.value = pageState.value?.data || [];
  total.value = pageState.value?.total || 0;
};

const handleSearch = () => {
  page.value = 1;
  loadTemplates();
};

const handleToggle = async (template: Template) => {
  try {
    await submitStatus({
      params: { uuid: template.uuid },
      data: { enabled: !template.enabled },
      url: `/api/template/${template.uuid}/status`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadTemplates();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleDelete = async (template: Template) => {
  Modal.confirm({
    title: t("TXT_CODE_TEMPLATE_DELETE_CONFIRM"),
    okText: t("TXT_CODE_31e92ef3"),
    cancelText: t("TXT_CODE_3b1cc020"),
    onOk: async () => {
      try {
        await submitDelete({
          params: { uuid: template.uuid },
          url: `/api/template/${template.uuid}`,
          forceRequest: true
        });
        message.success(t("TXT_CODE_28190dbc"));
        loadTemplates();
      } catch (error: any) {
        reportErrorMsg(error);
      }
    }
  });
};

const handleClone = async (template: Template) => {
  try {
    await submitClone({
      params: { uuid: template.uuid },
      url: `/api/template/${template.uuid}/clone`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadTemplates();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const emptyTemplate = (): Template => ({
  uuid: "",
  name: "",
  displayName: "",
  description: "",
  category: TemplateCategoryEnum.OTHER,
  type: TemplateTypeEnum.PROCESS,
  dockerImage: "",
  dockerTag: "",
  processCommand: "",
  processArgs: "",
  processEnv: {},
  defaultCpuLimit: 0,
  defaultMemoryLimit: 0,
  defaultDiskLimit: 0,
  defaultUploadLimit: 0,
  defaultDownloadLimit: 0,
  ports: [],
  volumes: [],
  version: "1.0.0",
  author: "",
  iconUrl: "",
  readme: "",
  enabled: true,
  isOfficial: false,
  sortOrder: 0,
  createdAt: "",
  updatedAt: ""
});

const formVisible = ref(false);
const editing = ref(false);
const form = reactive<Template>(emptyTemplate());
const envRows = ref<Array<{ key: string; value: string }>>([]);
const portRows = ref<Array<TemplatePort & { _key: number }>>([]);
const volumeRows = ref<Array<TemplateVolume & { _key: number }>>([]);

let rowSeq = 1;

const openCreate = () => {
  editing.value = false;
  Object.assign(form, emptyTemplate());
  envRows.value = [];
  portRows.value = [];
  volumeRows.value = [];
  formVisible.value = true;
};

const openEdit = (template: Template) => {
  editing.value = true;
  Object.assign(form, JSON.parse(JSON.stringify(template)));
  envRows.value = Object.entries(form.processEnv || {}).map(([key, value]) => ({ key, value }));
  portRows.value = (form.ports || []).map((port) => ({ ...port, _key: rowSeq++ }));
  volumeRows.value = (form.volumes || []).map((volume) => ({ ...volume, _key: rowSeq++ }));
  formVisible.value = true;
};

const addEnv = () => envRows.value.push({ key: "", value: "" });
const removeEnv = (index: number) => envRows.value.splice(index, 1);
const addPort = () =>
  portRows.value.push({ containerPort: 25565, protocol: "tcp", name: "", _key: rowSeq++ });
const removePort = (index: number) => portRows.value.splice(index, 1);
const addVolume = () =>
  volumeRows.value.push({ containerPath: "", hostPath: "", name: "", readOnly: false, _key: rowSeq++ });
const removeVolume = (index: number) => volumeRows.value.splice(index, 1);

const submitForm = async () => {
  if (!form.name.trim()) {
    message.error(t("TXT_CODE_TEMPLATE_NAME_REQUIRED"));
    return;
  }
  const env: Record<string, string> = {};
  envRows.value.forEach((row) => {
    if (row.key) env[row.key.trim()] = String(row.value ?? "");
  });
  const ports: TemplatePort[] = portRows.value
    .filter((row) => row.containerPort > 0 && row.name)
    .map((row) => ({
      containerPort: row.containerPort,
      protocol: row.protocol,
      name: row.name
    }));
  const volumes: TemplateVolume[] = volumeRows.value
    .filter((row) => row.containerPath)
    .map((row) => ({
      containerPath: row.containerPath,
      hostPath: row.hostPath || undefined,
      name: row.name || undefined,
      readOnly: row.readOnly
    }));

  const payload: Partial<Template> = {
    ...form,
    processEnv: env,
    ports,
    volumes
  };
  try {
    if (editing.value) {
      await submitUpdate({
        params: { uuid: form.uuid },
        data: payload,
        url: `/api/template/${form.uuid}`,
        forceRequest: true
      });
    } else {
      await submitCreate({ data: payload, forceRequest: true });
    }
    message.success(t("TXT_CODE_7f0c746d"));
    formVisible.value = false;
    loadTemplates();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const importVisible = ref(false);
const importData = ref("");

const openImport = () => {
  importData.value = "";
  importVisible.value = true;
};

const submitImport = async () => {
  try {
    let parsed: any;
    try {
      parsed = JSON.parse(importData.value);
    } catch {
      message.error(t("TXT_CODE_TEMPLATE_IMPORT_INVALID"));
      return;
    }
    await runImport({ data: { template: parsed }, forceRequest: true });
    message.success(t("TXT_CODE_7f0c746d"));
    importVisible.value = false;
    loadTemplates();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const exportVisible = ref(false);
const exportData = ref("");

const handleExport = async (template: Template) => {
  try {
    const result = await submitExport({
      params: { uuid: template.uuid },
      url: `/api/template/export/${template.uuid}`,
      forceRequest: true
    });
    exportData.value = JSON.stringify(result.value || {}, null, 2);
    exportVisible.value = true;
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const goBack = () => {
  router.push({ path: "/" });
};

onMounted(() => {
  loadCategories();
  loadTemplates();
});
</script>

<template>
  <div class="management-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_TEMPLATE_MANAGEMENT") }}</span>
      </template>
      <template #body>
        <div class="toolbar">
          <a-input
            v-model:value="keyword"
            :placeholder="t('TXT_CODE_TEMPLATE_NAME')"
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
          <a-button @click="openImport">
            <template #icon><PlusOutlined /></template>
            {{ t("TXT_CODE_TEMPLATE_IMPORT") }}
          </a-button>
          <a-button type="primary" @click="openCreate">
            <template #icon><PlusOutlined /></template>
            {{ t("TXT_CODE_TEMPLATE_CREATE") }}
          </a-button>
        </div>

        <a-table
          :data-source="templateList"
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
            loadTemplates();
          }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'category'">
              {{ categoryLabel(record.category) }}
            </template>
            <template v-else-if="column.key === 'type'">
              {{ record.type === TemplateTypeEnum.DOCKER ? t('TXT_CODE_TEMPLATE_TYPE_DOCKER') : t('TXT_CODE_TEMPLATE_TYPE_PROCESS') }}
            </template>
            <template v-else-if="column.key === 'enabled'">
              <a-tag :color="record.enabled ? 'green' : 'default'">
                <CheckOutlined v-if="record.enabled" />{{ t("TXT_CODE_TEMPLATE_ENABLED") }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openEdit(record as Template)">{{ t("TXT_CODE_EDIT") }}</a-button>
                <a-button size="small" @click="handleToggle(record as Template)">
                  <template #icon>
                    <CheckOutlined v-if="!record.enabled" />
                    <CloseOutlined v-else />
                  </template>
                  {{ record.enabled ? t("TXT_CODE_PLAN_DISABLE") : t("TXT_CODE_PLAN_ENABLE") }}
                </a-button>
                <a-button size="small" @click="handleClone(record as Template)">{{ t("TXT_CODE_TEMPLATE_CLONE") }}</a-button>
                <a-button size="small" @click="handleExport(record as Template)">{{ t("TXT_CODE_TEMPLATE_EXPORT") }}</a-button>
                <a-button size="small" danger @click="handleDelete(record as Template)">{{ t("TXT_CODE_28190dbc") }}</a-button>
              </a-space>
            </template>
          </template>
          <a-table-column key="name" :title="t('TXT_CODE_TEMPLATE_NAME')" data-index="name" />
          <a-table-column key="displayName" :title="t('TXT_CODE_TEMPLATE_DISPLAY_NAME')" data-index="displayName" />
          <a-table-column key="category" :title="t('TXT_CODE_TEMPLATE_CATEGORY')" />
          <a-table-column key="type" :title="t('TXT_CODE_TEMPLATE_TYPE')" align="center" />
          <a-table-column key="version" :title="t('TXT_CODE_TEMPLATE_VERSION')" data-index="version" align="center" />
          <a-table-column key="author" :title="t('TXT_CODE_TEMPLATE_AUTHOR')" data-index="author" />
          <a-table-column key="enabled" :title="t('TXT_CODE_TEMPLATE_ENABLED')" align="center" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>

    <a-modal
      v-model:open="formVisible"
      :title="editing ? t('TXT_CODE_TEMPLATE_EDIT') : t('TXT_CODE_TEMPLATE_CREATE')"
      :ok-text="t('TXT_CODE_31e92ef3')"
      :cancel-text="t('TXT_CODE_3b1cc020')"
      width="760px"
      @ok="submitForm"
    >
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_NAME')" required>
              <a-input v-model:value="form.name" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_DISPLAY_NAME')">
              <a-input v-model:value="form.displayName" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_CATEGORY')">
              <a-select v-model:value="form.category" :options="categoryOptions" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_TYPE')">
              <a-select v-model:value="form.type" :options="typeOptions" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_VERSION')">
              <a-input v-model:value="form.version" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item :label="t('TXT_CODE_TEMPLATE_DESCRIPTION')">
          <a-textarea v-model:value="form.description" :rows="2" />
        </a-form-item>

        <template v-if="form.type === TemplateTypeEnum.DOCKER">
          <a-row :gutter="12">
            <a-col :span="16">
              <a-form-item :label="t('TXT_CODE_TEMPLATE_DOCKER_IMAGE')" required>
                <a-input v-model:value="form.dockerImage" placeholder="e.g. itzg/minecraft-server" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item :label="t('TXT_CODE_TEMPLATE_DOCKER_TAG')">
                <a-input v-model:value="form.dockerTag" placeholder="latest" />
              </a-form-item>
            </a-col>
          </a-row>
        </template>
        <template v-else>
          <a-form-item :label="t('TXT_CODE_TEMPLATE_PROCESS_COMMAND')" required>
            <a-input v-model:value="form.processCommand" placeholder="java -jar server.jar" />
          </a-form-item>
          <a-form-item :label="t('TXT_CODE_TEMPLATE_PROCESS_ARGS')">
            <a-input v-model:value="form.processArgs" />
          </a-form-item>
        </template>

        <a-divider style="margin: 8px 0">
          {{ t("TXT_CODE_TEMPLATE_ENV") }}
        </a-divider>
        <div v-for="(row, index) in envRows" :key="index" class="row-editor">
          <a-input v-model:value="row.key" :placeholder="t('TXT_CODE_TEMPLATE_ENV_KEY')" />
          <a-input v-model:value="row.value" :placeholder="t('TXT_CODE_TEMPLATE_ENV_VALUE')" />
          <a-button danger @click="removeEnv(index)">
            <CloseOutlined />
          </a-button>
        </div>
        <a-button size="small" @click="addEnv">
          <PlusOutlined /> {{ t("TXT_CODE_TEMPLATE_ENV_KEY") }}
        </a-button>

        <a-divider style="margin: 8px 0">
          {{ t("TXT_CODE_TEMPLATE_PORTS") }}
        </a-divider>
        <div v-for="(row, index) in portRows" :key="row._key" class="row-editor">
          <a-input-number v-model:value="row.containerPort" :min="1" :max="65535" :precision="0" style="width: 140px" />
          <a-select v-model:value="row.protocol" style="width: 90px">
            <a-select-option value="tcp">tcp</a-select-option>
            <a-select-option value="udp">udp</a-select-option>
          </a-select>
          <a-input v-model:value="row.name" :placeholder="t('TXT_CODE_TEMPLATE_PORT_NAME')" />
          <a-button danger @click="removePort(index)">
            <CloseOutlined />
          </a-button>
        </div>
        <a-button size="small" @click="addPort">
          <PlusOutlined /> {{ t("TXT_CODE_TEMPLATE_PORTS") }}
        </a-button>

        <a-divider style="margin: 8px 0">
          {{ t("TXT_CODE_TEMPLATE_VOLUMES") }}
        </a-divider>
        <div v-for="(row, index) in volumeRows" :key="row._key" class="row-editor">
          <a-input v-model:value="row.containerPath" :placeholder="t('TXT_CODE_TEMPLATE_VOLUME_CONTAINER_PATH')" />
          <a-input v-model:value="row.hostPath" :placeholder="t('TXT_CODE_TEMPLATE_VOLUME_HOST_PATH')" />
          <a-checkbox v-model:checked="row.readOnly">{{ t("TXT_CODE_TEMPLATE_VOLUME_READONLY") }}</a-checkbox>
          <a-button danger @click="removeVolume(index)">
            <CloseOutlined />
          </a-button>
        </div>
        <a-button size="small" @click="addVolume">
          <PlusOutlined /> {{ t("TXT_CODE_TEMPLATE_VOLUMES") }}
        </a-button>

        <a-divider style="margin: 8px 0" />

        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_CPU')">
              <a-input-number v-model:value="form.defaultCpuLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_MEMORY')">
              <a-input-number v-model:value="form.defaultMemoryLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_DISK')">
              <a-input-number v-model:value="form.defaultDiskLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_UPLOAD')">
              <a-input-number v-model:value="form.defaultUploadLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="t('TXT_CODE_PLAN_DOWNLOAD')">
              <a-input-number v-model:value="form.defaultDownloadLimit" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_AUTHOR')">
              <a-input v-model:value="form.author" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_ICON_URL')">
              <a-input v-model:value="form.iconUrl" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_OFFICIAL')">
              <a-switch v-model:checked="form.isOfficial" />
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item :label="t('TXT_CODE_TEMPLATE_ENABLED')">
              <a-switch v-model:checked="form.enabled" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item :label="t('TXT_CODE_TEMPLATE_README')">
          <a-textarea v-model:value="form.readme" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="importVisible"
      :title="t('TXT_CODE_TEMPLATE_IMPORT_DIALOG')"
      :ok-text="t('TXT_CODE_31e92ef3')"
      :cancel-text="t('TXT_CODE_3b1cc020')"
      @ok="submitImport"
    >
      <a-textarea
        v-model:value="importData"
        :rows="12"
        :placeholder="t('TXT_CODE_TEMPLATE_IMPORT_PLACEHOLDER')"
      />
    </a-modal>

    <a-modal
      v-model:open="exportVisible"
      :title="t('TXT_CODE_TEMPLATE_EXPORT_DIALOG')"
      :footer="null"
      width="720px"
    >
      <a-textarea v-model:value="exportData" :rows="16" read-only />
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

  .row-editor {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .ant-input,
    .ant-input-number,
    .ant-select {
      flex: 1;
    }
  }
}
</style>
