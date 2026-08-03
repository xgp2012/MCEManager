<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { registerUser } from "@/services/apis";
import { reportErrorMsg } from "@/tools/validator";
import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { reactive, ref } from "vue";

const { execute } = registerUser();

const formData = reactive({
  username: "",
  password: "",
  email: ""
});

const submitting = ref(false);
const registeredEmail = ref("");

const handleRegister = async () => {
  if (!formData.username.trim() || !formData.password.trim() || !formData.email.trim()) {
    return message.error(t("TXT_CODE_c846074d"));
  }
  submitting.value = true;
  try {
    const result = await execute({ data: formData });
    if (result.value?.email) registeredEmail.value = result.value.email;
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    submitting.value = false;
  }
};

const goLogin = () => {
  router.push({ path: "/login" });
};
</script>

<template>
  <div class="auth-page-container">
    <div class="auth-page-body">
      <CardPanel class="auth-panel">
        <template #body>
          <div v-if="!registeredEmail" class="auth-panel-body">
            <a-typography-title :level="3" class="auth-title">
              {{ t("TXT_CODE_11d5caea") }}
            </a-typography-title>
            <a-typography-paragraph type="secondary" class="auth-subtitle">
              {{ t("TXT_CODE_AUTH_EMAIL_LABEL") }}
            </a-typography-paragraph>
            <form @submit.prevent>
              <a-input
                v-model:value="formData.username"
                class="account"
                size="large"
                :placeholder="t('TXT_CODE_80a560a1')"
              >
                <template #suffix>
                  <UserOutlined style="color: rgba(0, 0, 0, 0.45)" />
                </template>
              </a-input>
              <a-input
                v-model:value="formData.email"
                class="mt-16 account"
                type="text"
                :placeholder="t('TXT_CODE_AUTH_EMAIL_LABEL')"
                size="large"
              >
                <template #suffix>
                  <MailOutlined style="color: rgba(0, 0, 0, 0.45)" />
                </template>
              </a-input>
              <a-input
                v-model:value="formData.password"
                class="mt-16 account"
                type="password"
                :placeholder="t('TXT_CODE_551b0348')"
                size="large"
                @press-enter="handleRegister"
              >
                <template #suffix>
                  <LockOutlined style="color: rgba(0, 0, 0, 0.45)" />
                </template>
              </a-input>
            </form>

            <div class="mt-24 flex-between align-center">
              <a-button
                size="large"
                style="min-width: 95px"
                @click="goLogin"
              >
                {{ t("TXT_CODE_d2c1a316") }}
              </a-button>
              <a-button
                size="large"
                type="primary"
                style="min-width: 95px"
                :loading="submitting"
                @click="handleRegister"
              >
                {{ t("TXT_CODE_11d5caea") }}
              </a-button>
            </div>
          </div>
          <div v-else class="auth-panel-body">
            <a-result
              status="success"
              :title="t('TXT_CODE_AUTH_REGISTER_SUCCESS', { email: registeredEmail })"
            >
              <template #extra>
                <a-button type="primary" @click="goLogin">
                  {{ t("TXT_CODE_AUTH_GO_LOGIN") }}
                </a-button>
              </template>
            </a-result>
          </div>
        </template>
      </CardPanel>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.auth-page-container {
  position: fixed;
  left: 0px;
  right: 0px;
  bottom: 0px;
  top: 0px;
  background-color: #29292957;
  backdrop-filter: saturate(120%) blur(10px);
  overflow-y: auto;
  overflow-x: hidden;

  .auth-page-body {
    padding: 12px;
    padding-top: 84px;
    max-width: 1260px !important;
    margin: 0 auto;
    height: 100%;
    position: relative;

    .auth-panel {
      margin: 0 auto;
      max-width: 460px;
      width: 100%;
      background-color: var(--login-panel-bg);
      border: 1px solid var(--card-border-color);

      .auth-panel-body {
        padding: 28px 24px;
      }
    }

    .auth-title {
      margin-bottom: 8px !important;
    }

    .auth-subtitle {
      margin-bottom: 20px !important;
    }
  }
}
</style>
