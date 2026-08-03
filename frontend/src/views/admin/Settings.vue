<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { t } from "@/lang/i18n";
import {
  getBusinessSettings,
  getEmailConfig,
  getPayConfig,
  testEmailConfig,
  testPayConfig,
  updateBusinessSettings,
  updateEmailConfig,
  updatePayConfig
} from "@/services/apis/adminConfig";
import { reportErrorMsg } from "@/tools/validator";
import type {
  BusinessSettings,
  EmailConfig,
  PayConfig
} from "@/types/business";
import { listPlans } from "@/services/apis/plan";
import type { Plan } from "@/types/business";
import { message } from "ant-design-vue";
import { onMounted, reactive, ref } from "vue";

const { execute: fetchPay, state: payState } = getPayConfig();
const { execute: submitPay } = updatePayConfig();
const { execute: submitPayTest } = testPayConfig();
const { execute: fetchEmail, state: emailState } = getEmailConfig();
const { execute: submitEmail } = updateEmailConfig();
const { execute: submitEmailTest } = testEmailConfig();
const { execute: fetchBusiness, state: businessState } = getBusinessSettings();
const { execute: submitBusiness } = updateBusinessSettings();
const { execute: fetchPlans, state: planState } = listPlans();

const payForm = reactive<PayConfig>({
  payEnabled: false,
  currency: "CNY",
  orderExpireMinutes: 30,
  yipayApiUrl: "",
  yipayPid: "",
  yipayKey: "",
  yipayKeySet: false,
  yipaySignType: "MD5"
});
const emailForm = reactive<EmailConfig>({
  smtpEnabled: false,
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "",
  smtpPass: "",
  smtpPassSet: false,
  smtpFrom: "",
  smtpFromName: "",
  notifyOrderSuccess: true,
  notifyExpiryReminder: true,
  expiryReminderDays: 3,
  notifyPaymentFailure: true,
  notifyAdminAlert: false,
  adminAlertEmails: ""
});
const businessForm = reactive<BusinessSettings>({
  businessMode: false,
  registerEnabled: false,
  currency: "CNY",
  orderExpireMinutes: 30,
  defaultPlanUuid: ""
});
const plans = ref<Plan[]>([]);
const testEmailAddress = ref("");
const payTestResult = ref<{ success: boolean; status: number; message?: string } | null>(null);
const emailTestResult = ref<boolean | null>(null);
const paySaving = ref(false);
const emailSaving = ref(false);
const businessSaving = ref(false);

const loadPay = async () => {
  await fetchPay({ forceRequest: true });
  Object.assign(payForm, payState.value || {});
};

const savePay = async () => {
  paySaving.value = true;
  try {
    await submitPay({
      data: { ...payForm },
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadPay();
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    paySaving.value = false;
  }
};

const runPayTest = async () => {
  try {
    const result = await submitPayTest({ forceRequest: true });
    payTestResult.value = result.value || null;
    message.success(t("TXT_CODE_7f0c746d"));
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const loadEmail = async () => {
  await fetchEmail({ forceRequest: true });
  Object.assign(emailForm, emailState.value || {});
};

const saveEmail = async () => {
  emailSaving.value = true;
  try {
    await submitEmail({
      data: { ...emailForm },
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadEmail();
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    emailSaving.value = false;
  }
};

const runEmailTest = async () => {
  if (!testEmailAddress.value) {
    message.warning(t("TXT_CODE_ADMIN_EMAIL_TEST_ADDRESS_REQUIRED"));
    return;
  }
  try {
    await submitEmailTest({
      data: { to: testEmailAddress.value },
      forceRequest: true
    });
    emailTestResult.value = true;
    message.success(t("TXT_CODE_7f0c746d"));
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const loadBusiness = async () => {
  await fetchBusiness({ forceRequest: true });
  Object.assign(businessForm, businessState.value || {});
};

const saveBusiness = async () => {
  businessSaving.value = true;
  try {
    await submitBusiness({
      data: { ...businessForm },
      forceRequest: true
    });
    message.success(t("TXT_CODE_7f0c746d"));
    loadBusiness();
  } catch (error: any) {
    reportErrorMsg(error);
  } finally {
    businessSaving.value = false;
  }
};

onMounted(async () => {
  loadPay();
  loadEmail();
  loadBusiness();
  await fetchPlans({ params: { page: 1, page_size: 100 }, forceRequest: true });
  plans.value = planState.value?.data || [];
});
</script>

<template>
  <div class="settings-page">
    <CardPanel>
      <template #title>
        <span>{{ t("TXT_CODE_ADMIN_SETTINGS") }}</span>
      </template>
      <template #body>
        <a-tabs>
          <a-tab-pane :key="'pay'" :tab="t('TXT_CODE_ADMIN_SETTINGS_PAY')">
            <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
              <a-form-item :label="t('TXT_CODE_ADMIN_PAY_ENABLED')">
                <a-switch v-model:checked="payForm.payEnabled" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_CURRENCY')">
                <a-input v-model:value="payForm.currency" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_ORDER_EXPIRE_MINUTES')">
                <a-input-number v-model:value="payForm.orderExpireMinutes" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_YIPAY_API_URL')">
                <a-input v-model:value="payForm.yipayApiUrl" placeholder="https://..." />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_YIPAY_PID')">
                <a-input v-model:value="payForm.yipayPid" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_YIPAY_KEY')">
                <a-input-password v-model:value="payForm.yipayKey" :placeholder="payForm.yipayKeySet ? '******' : ''" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_YIPAY_SIGN_TYPE')">
                <a-select v-model:value="payForm.yipaySignType" style="width: 100%">
                  <a-select-option value="MD5">MD5</a-select-option>
                  <a-select-option value="RSA">RSA</a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item :wrapper-col="{ offset: 5 }">
                <a-space>
                  <a-button type="primary" :loading="paySaving" @click="savePay">
                    {{ t("TXT_CODE_31e92ef3") }}
                  </a-button>
                  <a-button @click="runPayTest">
                    {{ t("TXT_CODE_ADMIN_PAY_TEST") }}
                  </a-button>
                </a-space>
              </a-form-item>
              <a-form-item v-if="payTestResult" :wrapper-col="{ offset: 5 }">
                <a-alert
                  :type="payTestResult.success ? 'success' : 'error'"
                  :message="payTestResult.success
                    ? t('TXT_CODE_ADMIN_PAY_TEST_OK', { status: String(payTestResult.status) })
                    : (payTestResult.message || t('TXT_CODE_ADMIN_PAY_TEST_FAILED'))"
                />
              </a-form-item>
            </a-form>
          </a-tab-pane>

          <a-tab-pane :key="'email'" :tab="t('TXT_CODE_ADMIN_SETTINGS_EMAIL')">
            <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_ENABLED')">
                <a-switch v-model:checked="emailForm.smtpEnabled" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_HOST')">
                <a-input v-model:value="emailForm.smtpHost" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_PORT')">
                <a-input-number v-model:value="emailForm.smtpPort" :min="1" :max="65535" style="width: 100%" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_SECURE')">
                <a-switch v-model:checked="emailForm.smtpSecure" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_USER')">
                <a-input v-model:value="emailForm.smtpUser" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_PASS')">
                <a-input-password v-model:value="emailForm.smtpPass" :placeholder="emailForm.smtpPassSet ? '******' : ''" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_FROM')">
                <a-input v-model:value="emailForm.smtpFrom" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_SMTP_FROM_NAME')">
                <a-input v-model:value="emailForm.smtpFromName" />
              </a-form-item>
              <a-divider>{{ t("TXT_CODE_ADMIN_SETTINGS_NOTIFY") }}</a-divider>
              <a-form-item :label="t('TXT_CODE_ADMIN_NOTIFY_ORDER_SUCCESS')">
                <a-switch v-model:checked="emailForm.notifyOrderSuccess" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_NOTIFY_EXPIRY_REMINDER')">
                <a-switch v-model:checked="emailForm.notifyExpiryReminder" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_EXPIRY_REMINDER_DAYS')">
                <a-input-number
                  v-model:value="emailForm.expiryReminderDays"
                  :min="1"
                  :max="60"
                  style="width: 100%"
                />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_NOTIFY_PAYMENT_FAILURE')">
                <a-switch v-model:checked="emailForm.notifyPaymentFailure" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_NOTIFY_ADMIN_ALERT')">
                <a-switch v-model:checked="emailForm.notifyAdminAlert" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_ADMIN_ALERT_EMAILS')">
                <a-input v-model:value="emailForm.adminAlertEmails" placeholder="admin@example.com,ops@example.com" />
              </a-form-item>
              <a-form-item :wrapper-col="{ offset: 5 }">
                <a-button type="primary" :loading="emailSaving" @click="saveEmail">
                  {{ t("TXT_CODE_31e92ef3") }}
                </a-button>
              </a-form-item>
              <a-divider>{{ t("TXT_CODE_ADMIN_EMAIL_TEST") }}</a-divider>
              <a-form-item :label="t('TXT_CODE_ADMIN_EMAIL_TEST_ADDRESS')">
                <a-input v-model:value="testEmailAddress" placeholder="user@example.com" />
              </a-form-item>
              <a-form-item :wrapper-col="{ offset: 5 }">
                <a-button :loading="emailTestResult !== null" @click="runEmailTest">
                  {{ t("TXT_CODE_ADMIN_EMAIL_TEST_SEND") }}
                </a-button>
              </a-form-item>
            </a-form>
          </a-tab-pane>

          <a-tab-pane :key="'business'" :tab="t('TXT_CODE_ADMIN_SETTINGS_BUSINESS')">
            <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 14 }">
              <a-form-item :label="t('TXT_CODE_ADMIN_BUSINESS_MODE')">
                <a-switch v-model:checked="businessForm.businessMode" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_REGISTER_ENABLED')">
                <a-switch v-model:checked="businessForm.registerEnabled" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_CURRENCY')">
                <a-input v-model:value="businessForm.currency" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_ORDER_EXPIRE_MINUTES')">
                <a-input-number v-model:value="businessForm.orderExpireMinutes" :min="0" style="width: 100%" />
              </a-form-item>
              <a-form-item :label="t('TXT_CODE_ADMIN_DEFAULT_PLAN')">
                <a-select v-model:value="businessForm.defaultPlanUuid" allow-clear style="width: 100%">
                  <a-select-option v-for="plan in plans" :key="plan.uuid" :value="plan.uuid">
                    {{ plan.name }}
                  </a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item :wrapper-col="{ offset: 5 }">
                <a-button type="primary" :loading="businessSaving" @click="saveBusiness">
                  {{ t("TXT_CODE_31e92ef3") }}
                </a-button>
              </a-form-item>
            </a-form>
          </a-tab-pane>
        </a-tabs>
      </template>
    </CardPanel>
  </div>
</template>

<style lang="scss" scoped>
@import "@/assets/global.scss";

.settings-page {
  max-width: 900px;
}
</style>
