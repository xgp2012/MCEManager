<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import {
  deleteAdminUser,
  getAdminUserDetail,
  impersonateUser,
  listAdminUsers,
  updateAdminUserBalance,
  updateAdminUserStatus
} from "@/services/apis/adminUser";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { reportErrorMsg } from "@/tools/validator";
import type { AdminUser, AdminUserDetail } from "@/types/business";
import { OrderStatus, SubscriptionStatus, UserStatus as UserStatusEnum } from "@/types/business";
import { message, Modal } from "ant-design-vue";
import { onMounted, ref } from "vue";

const { execute: fetchUsers, state: pageState, isLoading } = listAdminUsers();
const { execute: submitStatus } = updateAdminUserStatus();
const { execute: submitBalance } = updateAdminUserBalance();
const { execute: submitImpersonate } = impersonateUser();
const { execute: submitDelete } = deleteAdminUser();
const { execute: fetchDetail, state: detailState } = getAdminUserDetail();
const { state: appState, updateUserInfo } = useAppStateStore();

const users = ref<AdminUser[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref("");
const statusFilter = ref<number | undefined>(undefined);

const detailVisible = ref(false);
const detail = ref<AdminUserDetail | null>(null);
const balanceModalVisible = ref(false);
const balanceChange = ref(0);
const balanceTarget = ref<AdminUser | null>(null);

const statusOptions = [
  { value: UserStatusEnum.PENDING_VERIFY, label: t("TXT_CODE_ADMIN_USER_STATUS_PENDING_VERIFY") },
  { value: UserStatusEnum.ACTIVE, label: t("TXT_CODE_ADMIN_USER_STATUS_ACTIVE") },
  { value: UserStatusEnum.SUSPENDED, label: t("TXT_CODE_ADMIN_USER_STATUS_SUSPENDED") },
  { value: UserStatusEnum.EXPIRED, label: t("TXT_CODE_ADMIN_USER_STATUS_EXPIRED") }
];

const statusLabel = (status: number) => {
  const found = statusOptions.find((item) => item.value === status);
  return found?.label || String(status);
};

const statusColor = (status: number) => {
  switch (status) {
    case UserStatusEnum.ACTIVE:
      return "green";
    case UserStatusEnum.PENDING_VERIFY:
      return "orange";
    case UserStatusEnum.SUSPENDED:
      return "red";
    default:
      return "default";
  }
};

const loadUsers = async () => {
  await fetchUsers({
    params: {
      page: page.value,
      page_size: pageSize.value,
      keyword: keyword.value || undefined,
      status: statusFilter.value
    },
    forceRequest: true
  });
  users.value = pageState.value?.data || [];
  total.value = pageState.value?.total || 0;
};

const handleSearch = () => {
  page.value = 1;
  loadUsers();
};

const handleStatusChange = async (user: AdminUser, status: number) => {
  try {
    await submitStatus({
      params: { uuid: user.uuid },
      data: { status },
      url: `/api/admin/users/${user.uuid}/status`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadUsers();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const openBalanceModal = (user: AdminUser) => {
  balanceTarget.value = user;
  balanceChange.value = 0;
  balanceModalVisible.value = true;
};

const submitBalanceChange = async () => {
  if (!balanceTarget.value) return;
  try {
    await submitBalance({
      params: { uuid: balanceTarget.value.uuid },
      data: { change: Math.round(balanceChange.value * 100) },
      url: `/api/admin/users/${balanceTarget.value.uuid}/balance`,
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    balanceModalVisible.value = false;
    loadUsers();
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const openDetail = async (user: AdminUser) => {
  detailVisible.value = true;
  detail.value = null;
  try {
    await fetchDetail({
      params: { uuid: user.uuid },
      url: `/api/admin/users/${user.uuid}`,
      forceRequest: true
    });
    detail.value = detailState.value || null;
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleImpersonate = async (user: AdminUser) => {
  try {
    const result = await submitImpersonate({
      params: { uuid: user.uuid },
      url: `/api/admin/users/${user.uuid}/impersonate`,
      forceRequest: true
    });
    const token = result.value?.token;
    if (token) {
      appState.userInfo = { ...appState.userInfo, token } as any;
      await updateUserInfo();
      router.push({ path: "/customer" });
    }
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const handleDelete = (user: AdminUser) => {
  Modal.confirm({
    title: t("TXT_CODE_ADMIN_USER_DELETE_CONFIRM", { name: user.userName }),
    okText: t("TXT_CODE_31e92ef3"),
    cancelText: t("TXT_CODE_3b1cc020"),
    okType: "danger",
    onOk: async () => {
      try {
        await submitDelete({
          params: { uuid: user.uuid },
          url: `/api/admin/users/${user.uuid}`,
          forceRequest: true
        });
        message.success(t("TXT_CODE_28190dbc"));
        loadUsers();
      } catch (error: any) {
        reportErrorMsg(error);
      }
    }
  });
};

const subscriptionStatusLabel = (status: number) => {
  switch (status) {
    case SubscriptionStatus.ACTIVE:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_ACTIVE");
    case SubscriptionStatus.PAST_DUE:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_PAST_DUE");
    case SubscriptionStatus.CANCELLED:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_CANCELLED");
    default:
      return t("TXT_CODE_SUBSCRIPTION_STATUS_EXPIRED");
  }
};

const orderStatusLabel = (status: number) => {
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

const formatTime = (value: string | number) => {
  if (!value) return "-";
  const date = new Date(value);
  return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const formatMoney = (value: number) => `¥ ${(Number(value) / 100).toFixed(2)}`;

onMounted(() => {
  loadUsers();
});
</script>

<template>
  <div class="user-list-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ADMIN_USERS") }}</span>
      </template>
      <template #body>
        <div class="toolbar">
          <a-input
            v-model:value="keyword"
            :placeholder="t('TXT_CODE_ADMIN_USER_SEARCH_PLACEHOLDER')"
            allow-clear
            style="width: 240px"
            @press-enter="handleSearch"
          />
          <a-select
            v-model:value="statusFilter"
            :placeholder="t('TXT_CODE_ADMIN_USER_STATUS_FILTER')"
            allow-clear
            style="width: 160px"
            @change="handleSearch"
          >
            <a-select-option
              v-for="option in statusOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </a-select-option>
          </a-select>
          <a-button type="primary" @click="handleSearch">
            {{ t("TXT_CODE_31e92ef3") }}
          </a-button>
        </div>

        <a-table
          :data-source="users"
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
            loadUsers();
          }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">
                {{ statusLabel(record.status) }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'emailVerified'">
              <a-tag :color="record.emailVerified ? 'green' : 'orange'">
                {{ record.emailVerified ? t("TXT_CODE_ADMIN_YES") : t("TXT_CODE_ADMIN_NO") }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'balance'">
              {{ formatMoney(record.balance) }}
            </template>
            <template v-else-if="column.key === 'registerTime'">
              {{ formatTime(record.registerTime) }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button size="small" @click="openDetail(record as AdminUser)">
                  {{ t("TXT_CODE_ADMIN_DETAIL") }}
                </a-button>
                <a-button size="small" @click="openBalanceModal(record as AdminUser)">
                  {{ t("TXT_CODE_ADMIN_BALANCE_ADJUST") }}
                </a-button>
                <a-button size="small" type="primary" @click="handleImpersonate(record as AdminUser)">
                  {{ t("TXT_CODE_ADMIN_IMPERSONATE") }}
                </a-button>
                <a-button
                  v-if="record.status === UserStatusEnum.ACTIVE"
                  size="small"
                  danger
                  @click="handleStatusChange(record as AdminUser, UserStatusEnum.SUSPENDED)"
                >
                  {{ t("TXT_CODE_ADMIN_SUSPEND") }}
                </a-button>
                <a-button
                  v-else
                  size="small"
                  @click="handleStatusChange(record as AdminUser, UserStatusEnum.ACTIVE)"
                >
                  {{ t("TXT_CODE_ADMIN_ACTIVATE") }}
                </a-button>
                <a-button size="small" danger @click="handleDelete(record as AdminUser)">
                  {{ t("TXT_CODE_28190dbc") }}
                </a-button>
              </a-space>
            </template>
          </template>
          <a-table-column key="userName" :title="t('TXT_CODE_ADMIN_USERNAME')" data-index="userName" />
          <a-table-column key="email" :title="t('TXT_CODE_ADMIN_EMAIL')" data-index="email" />
          <a-table-column key="balance" :title="t('TXT_CODE_ADMIN_BALANCE')" align="right" />
          <a-table-column key="status" :title="t('TXT_CODE_ADMIN_STATUS')" align="center" />
          <a-table-column key="emailVerified" :title="t('TXT_CODE_ADMIN_EMAIL_VERIFIED')" align="center" />
          <a-table-column key="registerTime" :title="t('TXT_CODE_ADMIN_REGISTER_TIME')" />
          <a-table-column key="actions" :title="t('TXT_CODE_fe731dfc')" align="center" />
        </a-table>
      </template>
    </CardPanel>

    <a-drawer
      v-model:open="detailVisible"
      :title="t('TXT_CODE_ADMIN_USER_DETAIL')"
      width="720"
    >
      <template v-if="detail">
        <a-descriptions :column="2" bordered size="small">
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_USERNAME')">
            {{ detail.userName }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_EMAIL')">
            {{ detail.email }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_STATUS')">
            <a-tag :color="statusColor(detail.status)">{{ statusLabel(detail.status) }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_BALANCE')">
            {{ formatMoney(detail.balance) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_REGISTER_TIME')">
            {{ formatTime(detail.registerTime) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_LAST_LOGIN')">
            {{ formatTime(detail.loginTime) }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_SSO_BOUND')">
            {{ detail.ssoBound ? t("TXT_CODE_ADMIN_YES") : t("TXT_CODE_ADMIN_NO") }}
          </a-descriptions-item>
          <a-descriptions-item :label="t('TXT_CODE_ADMIN_2FA')">
            {{ detail.open2FA ? t("TXT_CODE_ADMIN_YES") : t("TXT_CODE_ADMIN_NO") }}
          </a-descriptions-item>
        </a-descriptions>

        <a-divider>{{ t("TXT_CODE_ADMIN_SUBSCRIPTIONS") }}</a-divider>
        <a-table
          :data-source="detail.subscriptions"
          :pagination="false"
          size="small"
          row-key="uuid"
        >
          <a-table-column key="planName" :title="t('TXT_CODE_ADMIN_PLAN')" data-index="planName" />
          <a-table-column key="status" :title="t('TXT_CODE_ADMIN_STATUS')">
            <template #default="{ record }">
              <a-tag>{{ subscriptionStatusLabel(record.status) }}</a-tag>
            </template>
          </a-table-column>
          <a-table-column key="nextPaymentAt" :title="t('TXT_CODE_ADMIN_NEXT_PAYMENT')">
            <template #default="{ record }">
              {{ formatTime(record.nextPaymentAt) }}
            </template>
          </a-table-column>
        </a-table>

        <a-divider>{{ t("TXT_CODE_ADMIN_ORDERS") }}</a-divider>
        <a-table
          :data-source="detail.orders"
          :pagination="false"
          size="small"
          row-key="uuid"
        >
          <a-table-column key="subject" :title="t('TXT_CODE_ORDER_SUBJECT')" data-index="subject" />
          <a-table-column key="amount" :title="t('TXT_CODE_ORDER_AMOUNT')" align="right">
            <template #default="{ record }">
              {{ formatMoney(record.amount) }}
            </template>
          </a-table-column>
          <a-table-column key="status" :title="t('TXT_CODE_ORDER_STATUS')">
            <template #default="{ record }">
              <a-tag>{{ orderStatusLabel(record.status) }}</a-tag>
            </template>
          </a-table-column>
          <a-table-column key="createdAt" :title="t('TXT_CODE_ORDER_TIME')">
            <template #default="{ record }">
              {{ formatTime(record.createdAt) }}
            </template>
          </a-table-column>
        </a-table>

        <a-divider>{{ t("TXT_CODE_ADMIN_INSTANCES") }}</a-divider>
        <a-table
          :data-source="detail.instances"
          :pagination="false"
          size="small"
          row-key="instanceUuid"
        >
          <a-table-column key="nickname" :title="t('TXT_CODE_ADMIN_INSTANCE_NAME')" data-index="nickname" />
          <a-table-column key="instanceUuid" title="UUID" data-index="instanceUuid" />
        </a-table>
      </template>
    </a-drawer>

    <a-modal
      v-model:open="balanceModalVisible"
      :title="t('TXT_CODE_ADMIN_BALANCE_ADJUST')"
      @ok="submitBalanceChange"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('TXT_CODE_ADMIN_TARGET_USER')">
          <a-input :value="balanceTarget?.userName" disabled />
        </a-form-item>
        <a-form-item :label="t('TXT_CODE_ADMIN_BALANCE_CHANGE_CNY')">
          <a-input-number v-model:value="balanceChange" style="width: 100%" :precision="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.user-list-page {
  .toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
}
</style>
