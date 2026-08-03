<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { resendVerification, verifyEmail } from "@/services/apis";
import { reportErrorMsg } from "@/tools/validator";
import { LoadingOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { onMounted, ref } from "vue";

const status = ref<"verifying" | "success" | "failed">("verifying");
const email = ref("");
const errMsg = ref("");

const { execute: verify } = verifyEmail();
const { execute: resend } = resendVerification();

const goLogin = () => {
  router.push({ path: "/login" });
};

const handleResend = async () => {
  try {
    await resend({ data: { email: email.value } });
    message.success(t("TXT_CODE_AUTH_RESEND_SUCCESS"));
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

onMounted(async () => {
  const token = String(router.currentRoute.value.query.token || "");
  email.value = String(router.currentRoute.value.query.email || "");
  try {
    const result = await verify({ params: { token, email: email.value } });
    status.value = result.value === true ? "success" : "failed";
  } catch (error: any) {
    status.value = "failed";
    errMsg.value = error?.message || String(t("TXT_CODE_AUTH_VERIFY_FAILED"));
  }
});
</script>

<template>
  <div class="auth-page-container">
    <div class="auth-page-body">
      <CardPanel class="auth-panel">
        <template #body>
          <div v-if="status === 'verifying'" class="auth-panel-body flex-center">
            <div style="text-align: center">
              <LoadingOutlined style="font-size: 62px; font-weight: 800" />
              <a-typography-paragraph class="mt-16" type="secondary">
                {{ t("TXT_CODE_AUTH_VERIFYING") }}
              </a-typography-paragraph>
            </div>
          </div>
          <div v-else-if="status === 'success'" class="auth-panel-body">
            <a-result
              status="success"
              :title="t('TXT_CODE_AUTH_VERIFY_SUCCESS')"
            >
              <template #extra>
                <a-button type="primary" @click="goLogin">
                  {{ t("TXT_CODE_AUTH_GO_LOGIN") }}
                </a-button>
              </template>
            </a-result>
          </div>
          <div v-else class="auth-panel-body">
            <a-result
              status="error"
              :title="t('TXT_CODE_AUTH_VERIFY_FAILED')"
              :sub-title="errMsg || t('TXT_CODE_AUTH_VERIFY_EXPIRED_FRONT')"
            >
              <template #extra>
                <a-button
                  type="primary"
                  :disabled="!email"
                  @click="handleResend"
                >
                  {{ t("TXT_CODE_AUTH_RESEND_BTN") }}
                </a-button>
                <a-button @click="goLogin">
                  {{ t("TXT_CODE_AUTH_TO_LOGIN") }}
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
  }
}
</style>
