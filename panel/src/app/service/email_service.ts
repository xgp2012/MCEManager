import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { Order } from "../entity/order";
import { Plan } from "../entity/plan";
import { Subscription } from "../entity/subscription";
import { User } from "../entity/user";
import { $t } from "../i18n";
import { systemConfig } from "../setting";
import { logger } from "./log";

// Email verification token lifetime: 24 hours, one-time use
export const EMAIL_VERIFY_TOKEN_TTL = 24 * 60 * 60 * 1000;

export function generateVerifyToken(): string {
  return randomBytes(32).toString("hex");
}

function createTransporter(): Transporter | null {
  const config = systemConfig;
  if (!config || !config.smtpEnabled || !config.smtpHost || !config.smtpPort) return null;
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: Boolean(config.smtpSecure),
    auth: config.smtpUser
      ? {
          user: config.smtpUser,
          pass: config.smtpPass || ""
        }
      : undefined
  });
}

function getFromIdentity(): { fromName: string; from: string } {
  const config = systemConfig;
  const fromName = config?.smtpFromName || config?.smtpUser || "MCSManager Panel";
  const from = config?.smtpFrom || config?.smtpUser || "no-reply@localhost";
  return { fromName, from };
}

async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) throw new Error($t("TXT_CODE_EMAIL_SMTP_DISABLED"));
  const { fromName, from } = getFromIdentity();
  await transporter.sendMail({
    from: `"${fromName}" <${from}>`,
    to,
    subject,
    text,
    html
  });
}

export async function sendVerificationEmail(user: User, verifyUrl: string): Promise<void> {
  const config = systemConfig;
  if (!config?.smtpEnabled) throw new Error($t("TXT_CODE_EMAIL_SMTP_DISABLED"));
  if (!user.email) throw new Error($t("TXT_CODE_EMAIL_NO_ADDRESS"));

  try {
    await sendMail(
      user.email,
      $t("TXT_CODE_EMAIL_VERIFY_SUBJECT"),
      $t("TXT_CODE_EMAIL_VERIFY_TEXT", { userName: user.userName, verifyUrl }),
      $t("TXT_CODE_EMAIL_VERIFY_HTML", { userName: user.userName, verifyUrl })
    );
    logger.info($t("TXT_CODE_EMAIL_VERIFY_SENT", { email: user.email }));
  } catch (err: any) {
    logger.error(
      $t("TXT_CODE_EMAIL_SEND_FAILED", { email: user.email, err: String(err?.message || err) })
    );
    throw err;
  }
}

/**
 * Send a test email to an arbitrary recipient using the configured SMTP
 * server. Used by the admin email settings page to verify connectivity.
 */
export async function sendTestEmail(to: string): Promise<void> {
  const config = systemConfig;
  if (!config?.smtpHost || !config?.smtpPort) throw new Error($t("TXT_CODE_EMAIL_SMTP_DISABLED"));
  if (!to || !String(to).includes("@")) throw new Error($t("TXT_CODE_EMAIL_TEST_INVALID_ADDR"));

  try {
    await sendMail(
      String(to),
      $t("TXT_CODE_EMAIL_TEST_SUBJECT"),
      $t("TXT_CODE_EMAIL_TEST_TEXT"),
      $t("TXT_CODE_EMAIL_TEST_HTML")
    );
    logger.info($t("TXT_CODE_EMAIL_TEST_SENT", { email: String(to) }));
  } catch (err: any) {
    logger.error(
      $t("TXT_CODE_EMAIL_SEND_FAILED", { email: String(to), err: String(err?.message || err) })
    );
    throw err;
  }
}

/**
 * Notify the user that their order was paid and the instance was provisioned
 * successfully.
 */
export async function sendOrderSuccessEmail(
  user: User,
  order: Order,
  plan: Plan | null,
  instanceUuid: string
): Promise<void> {
  if (!systemConfig?.smtpEnabled || !systemConfig?.notifyOrderSuccess) return;
  if (!user.email) return;
  const amount = ((Number(order.amount) || 0) / 100).toFixed(2);
  const params = {
    userName: user.userName,
    planName: plan?.name || "",
    amount,
    currency: order.currency || systemConfig.currency || "CNY",
    instanceUuid,
    expireAt: order.expireAt || ""
  };
  try {
    await sendMail(
      user.email,
      $t("TXT_CODE_EMAIL_ORDER_SUCCESS_SUBJECT", params),
      $t("TXT_CODE_EMAIL_ORDER_SUCCESS_TEXT", params),
      $t("TXT_CODE_EMAIL_ORDER_SUCCESS_HTML", params)
    );
    logger.info($t("TXT_CODE_EMAIL_ORDER_SUCCESS_SENT", { email: user.email, uuid: order.uuid }));
  } catch (err: any) {
    logger.error(
      $t("TXT_CODE_EMAIL_SEND_FAILED", { email: user.email, err: String(err?.message || err) })
    );
  }
}

/**
 * Remind the user that a subscription will expire soon so they can renew in
 * advance.
 */
export async function sendExpiryReminderEmail(
  user: User,
  subscription: Subscription,
  plan: Plan | null,
  daysLeft: number
): Promise<void> {
  if (!systemConfig?.smtpEnabled || !systemConfig?.notifyExpiryReminder) return;
  if (!user.email) return;
  const expireAt = formatTime(subscription.currentPeriodEnd);
  const params = {
    userName: user.userName,
    planName: plan?.name || "",
    daysLeft: String(Math.max(0, Math.floor(daysLeft))),
    expireAt
  };
  try {
    await sendMail(
      user.email,
      $t("TXT_CODE_EMAIL_EXPIRY_REMINDER_SUBJECT", params),
      $t("TXT_CODE_EMAIL_EXPIRY_REMINDER_TEXT", params),
      $t("TXT_CODE_EMAIL_EXPIRY_REMINDER_HTML", params)
    );
    logger.info(
      $t("TXT_CODE_EMAIL_EXPIRY_REMINDER_SENT", { email: user.email, uuid: subscription.uuid })
    );
  } catch (err: any) {
    logger.error(
      $t("TXT_CODE_EMAIL_SEND_FAILED", { email: user.email, err: String(err?.message || err) })
    );
  }
}

/**
 * Notify the user that the automatic balance deduction failed and manual
 * renewal is required.
 */
export async function sendPaymentFailureEmail(
  user: User,
  subscription: Subscription,
  plan: Plan | null
): Promise<void> {
  if (!systemConfig?.smtpEnabled || !systemConfig?.notifyPaymentFailure) return;
  if (!user.email) return;
  const amount = ((Number(plan?.price) || 0) / 100).toFixed(2);
  const params = {
    userName: user.userName,
    planName: plan?.name || "",
    amount,
    currency: systemConfig.currency || "CNY",
    expireAt: formatTime(subscription.graceExpireAt || subscription.currentPeriodEnd)
  };
  try {
    await sendMail(
      user.email,
      $t("TXT_CODE_EMAIL_PAYMENT_FAILED_SUBJECT", params),
      $t("TXT_CODE_EMAIL_PAYMENT_FAILED_TEXT", params),
      $t("TXT_CODE_EMAIL_PAYMENT_FAILED_HTML", params)
    );
    logger.info(
      $t("TXT_CODE_EMAIL_PAYMENT_FAILED_SENT", { email: user.email, uuid: subscription.uuid })
    );
  } catch (err: any) {
    logger.error(
      $t("TXT_CODE_EMAIL_SEND_FAILED", { email: user.email, err: String(err?.message || err) })
    );
  }
}

/**
 * Send an operational alert (e.g. a daemon node went offline) to every
 * address configured in `adminAlertEmails`. This is a best-effort broadcast:
 * failures are logged and never thrown to the caller.
 */
export async function sendAdminAlertEmail(title: string, message: string): Promise<void> {
  const config = systemConfig;
  if (!config?.smtpEnabled || !config?.notifyAdminAlert) return;
  const recipients = String(config.adminAlertEmails || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.includes("@"));
  if (recipients.length === 0) return;

  const params = { title: String(title || ""), message: String(message || "") };
  for (const to of recipients) {
    try {
      await sendMail(
        to,
        $t("TXT_CODE_EMAIL_ALERT_SUBJECT", params),
        $t("TXT_CODE_EMAIL_ALERT_TEXT", params),
        $t("TXT_CODE_EMAIL_ALERT_HTML", params)
      );
    } catch (err: any) {
      logger.error(
        $t("TXT_CODE_EMAIL_SEND_FAILED", { email: to, err: String(err?.message || err) })
      );
    }
  }
  logger.info($t("TXT_CODE_EMAIL_ALERT_SENT", { to: recipients.join(",") }));
}

function formatTime(ms: number): string {
  return ms > 0 ? new Date(ms).toLocaleString() : "";
}
