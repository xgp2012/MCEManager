<script setup lang="ts">
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import {
  AppstoreOutlined,
  CloudServerOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  FileTextOutlined,
  GiftOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined
} from "@ant-design/icons-vue";
import { computed, h } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const { state, updateUserInfo } = useAppStateStore();

const selectedKeys = computed(() => {
  const path = route.path;
  if (path.startsWith("/admin/plans")) return ["/admin/plans"];
  if (path.startsWith("/admin/templates")) return ["/admin/templates"];
  if (path.startsWith("/admin/users")) return ["/admin/users"];
  if (path.startsWith("/admin/orders")) return ["/admin/orders"];
  if (path.startsWith("/admin/subscriptions")) return ["/admin/subscriptions"];
  if (path.startsWith("/admin/instances")) return ["/admin/instances"];
  if (path.startsWith("/admin/nodes")) return ["/admin/nodes"];
  if (path.startsWith("/admin/logs")) return ["/admin/logs"];
  if (path.startsWith("/admin/settings")) return ["/admin/settings"];
  return ["/admin/dashboard"];
});

const menuItems = [
  { key: "/admin/dashboard", icon: h(DashboardOutlined), label: t("TXT_CODE_ADMIN_DASHBOARD") },
  { key: "/admin/users", icon: h(TeamOutlined), label: t("TXT_CODE_ADMIN_USERS") },
  { key: "/admin/orders", icon: h(UnorderedListOutlined), label: t("TXT_CODE_ADMIN_ORDERS") },
  { key: "/admin/subscriptions", icon: h(CreditCardOutlined), label: t("TXT_CODE_ADMIN_SUBSCRIPTIONS") },
  { key: "/admin/instances", icon: h(CloudServerOutlined), label: t("TXT_CODE_ADMIN_INSTANCES") },
  { key: "/admin/nodes", icon: h(AppstoreOutlined), label: t("TXT_CODE_ADMIN_NODES") },
  { key: "/admin/plans", icon: h(GiftOutlined), label: t("TXT_CODE_ADMIN_PLANS") },
  { key: "/admin/templates", icon: h(AppstoreOutlined), label: t("TXT_CODE_ADMIN_TEMPLATES") },
  { key: "/admin/logs", icon: h(FileTextOutlined), label: t("TXT_CODE_ADMIN_LOGS") },
  { key: "/admin/settings", icon: h(SettingOutlined), label: t("TXT_CODE_ADMIN_SETTINGS") }
];

const onMenuClick = ({ key }: { key: string | number }) => {
  router.push({ path: String(key) });
};

const goBackToPanel = () => {
  router.push({ path: "/" });
};

const logout = async () => {
  state.userInfo = null;
  await router.push({ path: "/login" });
};
</script>

<template>
  <div class="admin-layout">
    <div class="admin-layout-header">
      <div class="header-left">
        <a-typography-title :level="4" style="margin: 0; color: #fff">
          {{ t("TXT_CODE_ADMIN_TITLE") }}
        </a-typography-title>
      </div>
      <div class="header-right">
        <a-space>
          <a-typography-text style="color: #fff">
            {{ state.userInfo?.userName }}
          </a-typography-text>
          <a-button size="small" ghost @click="goBackToPanel">
            {{ t("TXT_CODE_ADMIN_BACK_TO_PANEL") }}
          </a-button>
          <a-button size="small" danger @click="logout">
            <template #icon><LogoutOutlined /></template>
            {{ t("TXT_CODE_ADMIN_LOGOUT") }}
          </a-button>
        </a-space>
      </div>
    </div>
    <div class="admin-layout-body">
      <div class="admin-layout-sider">
        <a-menu
          :selected-keys="selectedKeys"
          mode="inline"
          theme="dark"
          :items="menuItems"
          @click="onMenuClick"
        >
        </a-menu>
      </div>
      <div class="admin-layout-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.admin-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--background-color-grey);

  .admin-layout-header {
    height: 56px;
    background-color: #001529;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    flex-shrink: 0;

    .header-right {
      display: flex;
      align-items: center;
    }
  }

  .admin-layout-body {
    flex: 1;
    display: flex;
    overflow: hidden;

    .admin-layout-sider {
      width: 220px;
      background-color: #001529;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .admin-layout-content {
      flex: 1;
      padding: 16px;
      overflow: auto;
    }
  }
}
</style>
