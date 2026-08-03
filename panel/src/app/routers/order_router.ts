import Koa from "koa";
import Router from "@koa/router";
import { BillingCycle } from "../entity/plan";
import { OrderStatus, OrderType } from "../entity/order";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { getUserUuid } from "../service/passport_service";
import { logger } from "../service/log";
import orderSystem from "../service/order_service";
import payService, { PayGateway } from "../service/pay_service";
import planSystem from "../service/plan_service";
import { systemConfig } from "../setting";

const router = new Router({ prefix: "/order" });

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
  // Route the user back through the panel's verify endpoint (`/pay/return/:gateway`)
  // so the return signature is validated before redirecting to the frontend.
  return `${ctx.origin}${prefix}/api/pay/return/${DEFAULT_GATEWAY}`;
}

// [User Permission]
// Create an order for a plan and return the payment link.
router.post(
  "/create",
  permission({ level: ROLE.USER }),
  validator({ body: { planUuid: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (!userUuid) throw new Error($t("TXT_CODE_ORDER_USER_REQUIRED"));

    const planUuid = String(ctx.request.body.planUuid);
    const type = Number(ctx.request.body.type ?? OrderType.PURCHASE);
    // Recurring plans default to auto-renew so the subscription keeps running
    // unless the user explicitly opts out.
    const plan = planSystem.getInstance(planUuid);
    if (!plan) throw new Error($t("TXT_CODE_PLAN_NOT_FOUND"));
    if (!plan.enabled) throw new Error($t("TXT_CODE_PLAN_DISABLED"));
    const autoRenew =
      ctx.request.body.autoRenew != null
        ? Boolean(ctx.request.body.autoRenew)
        : plan.billingCycle !== BillingCycle.ONCE;
    if (![OrderType.PURCHASE, OrderType.RENEW, OrderType.UPGRADE].includes(type))
      throw new Error($t("TXT_CODE_ORDER_TYPE_INVALID"));

    const gateway = getGateway(ctx);

    const order = await orderSystem.create({
      userUuid,
      planUuid,
      type,
      amount: plan.price,
      subject: plan.name,
      autoRenew
    });

    const result = await gateway.createOrder({
      orderNo: order.uuid,
      amount: order.amount,
      subject: order.subject,
      body: order.subject,
      notifyUrl: buildNotifyUrl(ctx),
      returnUrl: buildReturnUrl(ctx)
    });

    ctx.body = {
      order,
      payUrl: result.payUrl,
      gatewayOrderNo: result.gatewayOrderNo
    };
  }
);

// [User Permission]
// List the current user's orders.
router.get(
  "/list",
  permission({ level: ROLE.USER }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    if (!userUuid) throw new Error($t("TXT_CODE_ORDER_USER_REQUIRED"));
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    ctx.body = orderSystem.listByUser(userUuid, page, pageSize);
  }
);

// [User Permission]
// Get order detail (owner only).
router.get(
  "/:uuid",
  permission({ level: ROLE.USER }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    const order = orderSystem.getByUuid(String(ctx.params.uuid));
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    if (order.userUuid !== userUuid)
      throw new Error($t("TXT_CODE_ORDER_ACCESS_DENIED"));
    ctx.body = order;
  }
);

// [User Permission]
// (Re)generate the payment link for a pending order.
router.get(
  "/:uuid/pay",
  permission({ level: ROLE.USER }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    const order = orderSystem.getByUuid(String(ctx.params.uuid));
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    if (order.userUuid !== userUuid)
      throw new Error($t("TXT_CODE_ORDER_ACCESS_DENIED"));
    if (order.status !== OrderStatus.PENDING)
      throw new Error($t("TXT_CODE_ORDER_ALREADY_PAID"));

    const gateway = getGateway(ctx);
    const result = await gateway.createOrder({
      orderNo: order.uuid,
      amount: order.amount,
      subject: order.subject,
      body: order.subject,
      notifyUrl: buildNotifyUrl(ctx),
      returnUrl: buildReturnUrl(ctx)
    });

    ctx.body = {
      order,
      payUrl: result.payUrl,
      gatewayOrderNo: result.gatewayOrderNo
    };
  }
);

// [User Permission]
// Cancel a pending order.
router.post(
  "/:uuid/cancel",
  permission({ level: ROLE.USER }),
  async (ctx: Koa.ParameterizedContext) => {
    const userUuid = getUserUuid(ctx);
    const order = orderSystem.getByUuid(String(ctx.params.uuid));
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    if (order.userUuid !== userUuid)
      throw new Error($t("TXT_CODE_ORDER_ACCESS_DENIED"));
    await orderSystem.cancelOrder(order.uuid);
    ctx.body = true;
  }
);

export default router;
