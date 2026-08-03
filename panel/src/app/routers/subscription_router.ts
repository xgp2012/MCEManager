import Koa from "koa";
import Router from "@koa/router";
import { OrderStatus } from "../entity/order";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { getUserUuid } from "../service/passport_service";
import { logger } from "../service/log";
import payService, { PayGateway } from "../service/pay_service";
import subscriptionSystem from "../service/subscription_service";
import userSystem from "../service/user_service";
import { systemConfig } from "../setting";

const router = new Router({ prefix: "/subscription" });

const DEFAULT_GATEWAY = "yipay";

function getGateway(ctx: Koa.ParameterizedContext): PayGateway {
  const gateway = payService.getGateway(DEFAULT_GATEWAY);
  if (!gateway) throw new Error($t("TXT_CODE_PAY_NOT_CONFIGURED"));
  return gateway;
}

function buildNotifyUrl(ctx: Koa.ParameterizedContext): string {
  const prefix = systemConfig?.prefix || "";
  return `${ctx.origin}${prefix}/api/pay/callback/${DEFAULT_GATEWAY}`;
}

function buildReturnUrl(ctx: Koa.ParameterizedContext): string {
  const prefix = systemConfig?.prefix || "";
  return `${ctx.origin}${prefix}/api/pay/return/${DEFAULT_GATEWAY}`;
}

function requireSubscription(
  ctx: Koa.ParameterizedContext,
  userUuid: string
) {
  const subscription = subscriptionSystem.getByUuid(String(ctx.params.uuid));
  if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
  if (subscription.userUuid !== userUuid)
    throw new Error($t("TXT_CODE_SUBSCRIPTION_ACCESS_DENIED"));
  return subscription;
}

// [User Permission]
// List the current user's subscriptions (enriched with plan info) together
// with the user balance so the subscription page can show it.
router.get(
  "/list",
  permission({ level: ROLE.USER }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (!userUuid) throw new Error($t("TXT_CODE_ORDER_USER_REQUIRED"));
    const user = userSystem.getInstance(userUuid);
    ctx.body = {
      list: subscriptionSystem.listByUser(userUuid).map((sub) =>
        subscriptionSystem.withPlanInfo(sub)
      ),
      balance: Number(user?.balance) || 0
    };
  }
);

// [User Permission]
// Get subscription detail (owner only).
router.get(
  "/:uuid",
  permission({ level: ROLE.USER }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (!userUuid) throw new Error($t("TXT_CODE_ORDER_USER_REQUIRED"));
    const subscription = requireSubscription(ctx, userUuid);
    ctx.body = subscriptionSystem.withPlanInfo(subscription);
  }
);

// [User Permission]
// Cancel auto-renewal (the subscription stops at the period end).
router.post(
  "/:uuid/cancel",
  permission({ level: ROLE.USER }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (!userUuid) throw new Error($t("TXT_CODE_ORDER_USER_REQUIRED"));
    const subscription = requireSubscription(ctx, userUuid);
    await subscriptionSystem.cancel(subscription.uuid, userUuid);
    ctx.body = true;
  }
);

// [User Permission]
// Toggle auto-renewal.
router.put(
  "/:uuid/auto-renew",
  permission({ level: ROLE.USER }),
  validator({ body: { enabled: Boolean } }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (!userUuid) throw new Error($t("TXT_CODE_ORDER_USER_REQUIRED"));
    const subscription = requireSubscription(ctx, userUuid);
    await subscriptionSystem.setAutoRenew(
      subscription.uuid,
      userUuid,
      Boolean(ctx.request.body.enabled)
    );
    ctx.body = true;
  }
);

// [User Permission]
// Manual renewal: deducts the balance when it covers the price, otherwise
// creates a RENEW order and returns its payment link.
router.post(
  "/:uuid/renew",
  permission({ level: ROLE.USER }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (!userUuid) throw new Error($t("TXT_CODE_ORDER_USER_REQUIRED"));
    const subscription = requireSubscription(ctx, userUuid);

    const order = await subscriptionSystem.renew(subscription.uuid, userUuid);
    if (order.status === OrderStatus.COMPLETED) {
      // COMPLETED - the balance already covered the renewal.
      ctx.body = { order, paidByBalance: true };
      return;
    }

    const gateway = getGateway(ctx);
    const result = await gateway.createOrder({
      orderNo: order.uuid,
      amount: order.amount,
      subject: order.subject,
      body: order.subject,
      notifyUrl: buildNotifyUrl(ctx),
      returnUrl: buildReturnUrl(ctx)
    });
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_ORDER_CREATED", {
        order: order.uuid,
        sub: subscription.uuid
      })
    );

    ctx.body = {
      order,
      payUrl: result.payUrl,
      gatewayOrderNo: result.gatewayOrderNo,
      paidByBalance: false
    };
  }
);

export default router;
