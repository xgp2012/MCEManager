import Router from "@koa/router";
import axios from "axios";
import Koa from "koa";
import { GlobalVariable } from "mcsmanager-common";
import SystemConfig from "../entity/setting";
import { ROLE, UserStatus } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import {
  EMAIL_VERIFY_TOKEN_TTL,
  generateVerifyToken,
  sendVerificationEmail
} from "../service/email_service";
import { logger } from "../service/log";
import { operationLogger } from "../service/operation_logger";
import { check, checkBanIp, login, logout } from "../service/passport_service";
import userSystem, { TwoFactorError } from "../service/user_service";
import { systemConfig } from "../setting";

const router = new Router({ prefix: "/auth" });

function isValidEmail(email: string): boolean {
  if (email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildVerifyUrl(ctx: Koa.ParameterizedContext, user: any, token: string): string {
  const prefix = systemConfig?.prefix || "";
  const base = `${ctx.origin}${prefix}`;
  return `${base}/#/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(
    user.email
  )}`;
}

// [Public Permission]
// login route
router.post(
  "/login",
  permission({ token: false, level: null }),
  validator({ body: { username: String, password: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    if (systemConfig?.ssoEnabled && systemConfig?.ssoOnlyMode) {
      ctx.body = new Error("Password login is disabled. Please use SSO.");
      return;
    }
    const userName = String(ctx.request.body.username);
    const passWord = String(ctx.request.body.password);
    const code = String(ctx.request.body.code);
    if (!checkBanIp(ctx)) throw new Error($t("TXT_CODE_router.login.ban"));
    if (check(ctx)) return (ctx.body = "Logined");
    try {
      ctx.body = login(ctx, userName, passWord, code);
      operationLogger.info("user_login", {
        operator_ip: ctx.ip,
        operator_name: userName,
        login_result: true
      });
    } catch (error: any) {
      if (error instanceof TwoFactorError && !code) {
        ctx.body = "NEED_2FA";
        return;
      }
      ctx.body = error;
      operationLogger.warning("user_login", {
        operator_ip: ctx.ip,
        operator_name: userName,
        login_result: false
      });
    }
  }
);

// [Public Permission]
// exit route
router.get(
  "/logout",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    logout(ctx);
    ctx.body = true;
  }
);

// [Public Permission]
// Display the text of the login interface
router.all(
  "/login_info",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    ctx.body = {
      loginInfo: systemConfig?.loginInfo
    };
  }
);

// [Public Permission]
// Get the state information that the panel can expose
router.all(
  "/status",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    let isInstall = true;
    if (userSystem.objects.size === 0) {
      isInstall = false;
    }
    ctx.body = {
      versionChange: GlobalVariable.get("versionChange", null),
      isInstall,
      language: systemConfig?.language || null,
      settings: {
        canFileManager: systemConfig?.canFileManager || false,
        allowUsePreset: systemConfig?.allowUsePreset || false,
        businessMode: systemConfig?.businessMode || false,
        businessId: systemConfig?.businessId || null,
        allowChangeCmd: systemConfig?.allowChangeCmd || false,
        panelId: systemConfig?.panelId || null,
        ssoEnabled: systemConfig?.ssoEnabled || false,
        ssoOnlyMode: systemConfig?.ssoOnlyMode || false,
        registerEnabled: systemConfig?.registerEnabled || false,
        smtpEnabled: systemConfig?.smtpEnabled || false
      } as Partial<SystemConfig>
    };
  }
);

// [Public Permission]
// User registration (email verification required)
router.post(
  "/register",
  permission({ token: false, level: null }),
  validator({ body: { username: String, password: String, email: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    if (!systemConfig?.registerEnabled)
      throw new Error($t("TXT_CODE_AUTH_REGISTER_DISABLED"));
    if (!systemConfig?.smtpEnabled)
      throw new Error($t("TXT_CODE_AUTH_SMTP_NOT_CONFIGURED"));

    const userName = String(ctx.request.body.username).trim();
    const passWord = String(ctx.request.body.password);
    const email = String(ctx.request.body.email).trim().toLowerCase();

    if (!userName) throw new Error($t("TXT_CODE_AUTH_USERNAME_REQUIRED"));
    if (!userSystem.validatePassword(passWord))
      throw new Error($t("TXT_CODE_router.user.passwordCheck"));
    if (!isValidEmail(email)) throw new Error($t("TXT_CODE_AUTH_INVALID_EMAIL"));
    if (userSystem.existUserName(userName))
      throw new Error($t("TXT_CODE_router.user.existsUserName"));
    if (userSystem.getUserByEmail(email)) throw new Error($t("TXT_CODE_AUTH_EMAIL_EXISTS"));

    const { uuid } = await userSystem.create({
      userName,
      passWord,
      permission: ROLE.USER,
      email,
      emailVerified: false,
      status: UserStatus.PENDING_VERIFY,
      balance: 0
    });

    const token = generateVerifyToken();
    await userSystem.edit(uuid, {
      emailVerifyToken: token,
      emailVerifyExpire: Date.now() + EMAIL_VERIFY_TOKEN_TTL
    });

    const user = userSystem.getInstance(uuid);
    if (!user) throw new Error($t("TXT_CODE_AUTH_USER_CREATE_FAILED"));

    const verifyUrl = buildVerifyUrl(ctx, user, token);
    try {
      await sendVerificationEmail(user, verifyUrl);
    } catch (err) {
      // Roll back the unverifiable account so the user can retry registration
      await userSystem.deleteInstance(uuid);
      throw err;
    }

    operationLogger.info("user_register", {
      operator_ip: ctx.ip,
      operator_name: userName
    });

    ctx.body = { uuid, userName, email };
  }
);

// [Public Permission]
// Verify email by one-time token (24h validity)
router.get(
  "/verify-email",
  permission({ token: false, level: null, speedLimit: false }),
  validator({ query: { token: String, email: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const token = String(ctx.query.token);
    const email = String(ctx.query.email).trim().toLowerCase();
    const user = userSystem.getUserByEmail(email);
    if (!user) throw new Error($t("TXT_CODE_AUTH_VERIFY_INVALID"));
    if (!user.emailVerifyToken || user.emailVerifyToken !== token)
      throw new Error($t("TXT_CODE_AUTH_VERIFY_INVALID"));
    if (!user.emailVerifyExpire || user.emailVerifyExpire < Date.now())
      throw new Error($t("TXT_CODE_AUTH_VERIFY_EXPIRED"));

    await userSystem.edit(user.uuid, {
      emailVerified: true,
      status: UserStatus.ACTIVE,
      emailVerifyToken: "",
      emailVerifyExpire: 0
    });

    logger.info($t("TXT_CODE_AUTH_EMAIL_VERIFIED", { email }));
    ctx.body = true;
  }
);

// [Public Permission]
// Resend verification email
router.post(
  "/resend-verification",
  permission({ token: false, level: null }),
  validator({ body: { email: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    if (!systemConfig?.smtpEnabled)
      throw new Error($t("TXT_CODE_AUTH_SMTP_NOT_CONFIGURED"));

    const email = String(ctx.request.body.email).trim().toLowerCase();
    const user = userSystem.getUserByEmail(email);
    if (!user) throw new Error($t("TXT_CODE_AUTH_EMAIL_NOT_FOUND"));
    if (user.emailVerified) return (ctx.body = true);

    const token = generateVerifyToken();
    await userSystem.edit(user.uuid, {
      emailVerifyToken: token,
      emailVerifyExpire: Date.now() + EMAIL_VERIFY_TOKEN_TTL
    });

    const verifyUrl = buildVerifyUrl(ctx, user, token);
    await sendVerificationEmail(user, verifyUrl);
    ctx.body = true;
  }
);

// [Public Permission]
// Install the panel, only available when the number of user entities is 0
router.all(
  "/install",
  permission({ token: false, level: null }),
  validator({ body: { username: String, password: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const userName = String(ctx.request.body.username);
    const passWord = String(ctx.request.body.password);
    if (userSystem.objects.size === 0) {
      if (!userSystem.validatePassword(passWord))
        throw new Error($t("TXT_CODE_router.user.passwordCheck"));
      logger.info($t("TXT_CODE_router.login.init", { userName }));
      await userSystem.create({
        userName,
        passWord,
        permission: 10,
        // Bootstrap admin is auto-verified so the panel can be configured first
        emailVerified: true,
        status: UserStatus.ACTIVE
      });
      operationLogger.log("user_create", {
        operator_ip: ctx.ip,
        operator_name: userName,
        target_user_name: userName
      });
      login(ctx, userName, passWord);
      return (ctx.body = true);
    }
    throw new Error($t("TXT_CODE_router.user.installed"));
  }
);

router.all(
  "/proxy",
  validator({ query: { target: String } }),
  permission({ level: ROLE.ADMIN }),
  async (ctx) => {
    try {
      const response = await axios.request({
        method: (ctx.query.method as string) || ctx.method,
        url: String(ctx.query.target)
      });
      if (response.status !== 200) throw new Error("Response code != 200");
      ctx.body = response.data;
    } catch (err) {
      ctx.body = err;
    }
  }
);

export default router;
