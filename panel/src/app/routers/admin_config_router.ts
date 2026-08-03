import axios from "axios";
import Koa from "koa";
import Router from "@koa/router";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { sendTestEmail } from "../service/email_service";
import { operationLogger } from "../service/operation_logger";
import { saveSystemConfig, systemConfig } from "../setting";

const router = new Router({ prefix: "/" });

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

// ----------------------------------------------------------------
// Payment gateway configuration
// ----------------------------------------------------------------

// [Admin Permission]
// Get payment configuration (merchant key masked).
router.get("/pay/config", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  ctx.body = {
    payEnabled: Boolean(systemConfig?.payEnabled),
    currency: systemConfig?.currency || "CNY",
    orderExpireMinutes: systemConfig?.orderExpireMinutes ?? 30,
    yipayApiUrl: systemConfig?.yipayApiUrl || "",
    yipayPid: systemConfig?.yipayPid || "",
    yipayKey: maskSecret(systemConfig?.yipayKey || ""),
    yipayKeySet: Boolean(systemConfig?.yipayKey),
    yipaySignType: systemConfig?.yipaySignType || "MD5"
  };
});

// [Admin Permission]
// Update payment configuration.
router.put(
  "/pay/config",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const config = ctx.request.body || {};
    if (!systemConfig) throw new Error($t("TXT_CODE_ADMIN_CONFIG_MISSING"));

    if (config.payEnabled != null) systemConfig.payEnabled = Boolean(config.payEnabled);
    if (config.currency != null) systemConfig.currency = String(config.currency).trim().toUpperCase();
    if (config.orderExpireMinutes != null) {
      const minutes = Number(config.orderExpireMinutes);
      if (isNaN(minutes) || minutes < 0) throw new Error($t("TXT_CODE_ADMIN_EXPIRE_INVALID"));
      systemConfig.orderExpireMinutes = minutes;
    }
    if (config.yipayApiUrl != null) {
      const url = String(config.yipayApiUrl).trim();
      if (url && !url.startsWith("https://") && !url.startsWith("http://"))
        throw new Error($t("TXT_CODE_ADMIN_URL_INVALID"));
      systemConfig.yipayApiUrl = url;
    }
    if (config.yipayPid != null) systemConfig.yipayPid = String(config.yipayPid).trim();
    // An empty key means "keep the current key"; a non-empty value replaces it.
    if (config.yipayKey != null && String(config.yipayKey).trim()) {
      systemConfig.yipayKey = String(config.yipayKey).trim();
    }
    if (config.yipaySignType != null) {
      const signType = String(config.yipaySignType).toUpperCase();
      if (signType !== "MD5" && signType !== "RSA")
        throw new Error($t("TXT_CODE_ADMIN_SIGN_TYPE_INVALID"));
      systemConfig.yipaySignType = signType;
    }

    saveSystemConfig(systemConfig);
    operationLogger.warning("pay_config_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"]
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Test payment gateway connectivity.
router.post("/pay/test", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const url = systemConfig?.yipayApiUrl;
  if (!url) throw new Error($t("TXT_CODE_ADMIN_PAY_TEST_NO_URL"));
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: () => true
    });
    if (response.status >= 200 && response.status < 400) {
      ctx.body = { success: true, status: response.status };
    } else {
      ctx.body = { success: false, status: response.status, message: $t("TXT_CODE_ADMIN_PAY_TEST_FAILED") };
    }
  } catch (err: any) {
    ctx.body = {
      success: false,
      status: 0,
      message: String(err?.message || err)
    };
  }
});

// ----------------------------------------------------------------
// SMTP / email configuration
// ----------------------------------------------------------------

// [Admin Permission]
// Get SMTP configuration (password masked) and notification template toggles.
router.get("/email/config", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  ctx.body = {
    smtpEnabled: Boolean(systemConfig?.smtpEnabled),
    smtpHost: systemConfig?.smtpHost || "",
    smtpPort: systemConfig?.smtpPort ?? 465,
    smtpSecure: Boolean(systemConfig?.smtpSecure),
    smtpUser: systemConfig?.smtpUser || "",
    smtpPass: maskSecret(systemConfig?.smtpPass || ""),
    smtpPassSet: Boolean(systemConfig?.smtpPass),
    smtpFrom: systemConfig?.smtpFrom || "",
    smtpFromName: systemConfig?.smtpFromName || "",
    notifyOrderSuccess: systemConfig?.notifyOrderSuccess ?? true,
    notifyExpiryReminder: systemConfig?.notifyExpiryReminder ?? true,
    expiryReminderDays: systemConfig?.expiryReminderDays ?? 3,
    notifyPaymentFailure: systemConfig?.notifyPaymentFailure ?? true,
    notifyAdminAlert: Boolean(systemConfig?.notifyAdminAlert),
    adminAlertEmails: systemConfig?.adminAlertEmails || ""
  };
});

// [Admin Permission]
// Update SMTP configuration.
router.put(
  "/email/config",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const config = ctx.request.body || {};
    if (!systemConfig) throw new Error($t("TXT_CODE_ADMIN_CONFIG_MISSING"));

    if (config.smtpEnabled != null) systemConfig.smtpEnabled = Boolean(config.smtpEnabled);
    if (config.smtpHost != null) systemConfig.smtpHost = String(config.smtpHost).trim();
    if (config.smtpPort != null) {
      const port = Number(config.smtpPort);
      if (isNaN(port) || port <= 0 || port > 65535)
        throw new Error($t("TXT_CODE_ADMIN_PORT_INVALID"));
      systemConfig.smtpPort = port;
    }
    if (config.smtpSecure != null) systemConfig.smtpSecure = Boolean(config.smtpSecure);
    if (config.smtpUser != null) systemConfig.smtpUser = String(config.smtpUser).trim();
    if (config.smtpPass != null && String(config.smtpPass).trim()) {
      systemConfig.smtpPass = String(config.smtpPass).trim();
    }
    if (config.smtpFrom != null) systemConfig.smtpFrom = String(config.smtpFrom).trim();
    if (config.smtpFromName != null) systemConfig.smtpFromName = String(config.smtpFromName).trim();

    if (config.notifyOrderSuccess != null)
      systemConfig.notifyOrderSuccess = Boolean(config.notifyOrderSuccess);
    if (config.notifyExpiryReminder != null)
      systemConfig.notifyExpiryReminder = Boolean(config.notifyExpiryReminder);
    if (config.expiryReminderDays != null) {
      const days = Number(config.expiryReminderDays);
      if (isNaN(days) || days < 1 || days > 60)
        throw new Error($t("TXT_CODE_ADMIN_REMINDER_DAYS_INVALID"));
      systemConfig.expiryReminderDays = days;
    }
    if (config.notifyPaymentFailure != null)
      systemConfig.notifyPaymentFailure = Boolean(config.notifyPaymentFailure);
    if (config.notifyAdminAlert != null)
      systemConfig.notifyAdminAlert = Boolean(config.notifyAdminAlert);
    if (config.adminAlertEmails != null)
      systemConfig.adminAlertEmails = String(config.adminAlertEmails).trim();

    saveSystemConfig(systemConfig);
    operationLogger.warning("email_config_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"]
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Send a test email.
router.post(
  "/email/test",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { to: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const to = String(ctx.request.body.to || "");
    await sendTestEmail(to);
    ctx.body = true;
  }
);

// ----------------------------------------------------------------
// Business settings
// ----------------------------------------------------------------

// [Admin Permission]
// Get business-related settings.
router.get("/settings", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  ctx.body = {
    businessMode: Boolean(systemConfig?.businessMode),
    registerEnabled: Boolean(systemConfig?.registerEnabled),
    currency: systemConfig?.currency || "CNY",
    orderExpireMinutes: systemConfig?.orderExpireMinutes ?? 30,
    defaultPlanUuid: systemConfig?.defaultPlanUuid || ""
  };
});

// [Admin Permission]
// Update business-related settings.
router.put(
  "/settings",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const config = ctx.request.body || {};
    if (!systemConfig) throw new Error($t("TXT_CODE_ADMIN_CONFIG_MISSING"));

    if (config.registerEnabled != null) systemConfig.registerEnabled = Boolean(config.registerEnabled);
    if (config.currency != null) systemConfig.currency = String(config.currency).trim().toUpperCase();
    if (config.orderExpireMinutes != null) {
      const minutes = Number(config.orderExpireMinutes);
      if (isNaN(minutes) || minutes < 0) throw new Error($t("TXT_CODE_ADMIN_EXPIRE_INVALID"));
      systemConfig.orderExpireMinutes = minutes;
    }
    if (config.defaultPlanUuid != null) systemConfig.defaultPlanUuid = String(config.defaultPlanUuid).trim();

    saveSystemConfig(systemConfig);
    operationLogger.warning("business_setting_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"]
    });
    ctx.body = true;
  }
);

export default router;
