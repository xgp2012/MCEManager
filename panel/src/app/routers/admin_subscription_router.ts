import Koa from "koa";
import Router from "@koa/router";
import { OrderStatus } from "../entity/order";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { operationLogger } from "../service/operation_logger";
import payService, { PayGateway } from "../service/pay_service";
import subscriptionSystem from "../service/subscription_service";
import userSystem from "../service/user_service";
import { systemConfig } from "../setting";

const router = new Router({ prefix: "/subscriptions" });

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

function withUserInfo(sub: any) {
  const user = userSystem.getInstance(sub.userUuid);
  const enriched = subscriptionSystem.withPlanInfo(sub);
  return {
    ...JSON.parse(JSON.stringify(enriched)),
    userName: user?.userName || "",
    userEmail: user?.email || ""
  };
}

// [Admin Permission]
// All subscriptions with optional status / keyword filters.
router.get(
  "/",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    const status = ctx.query.status != null ? Number(ctx.query.status) : NaN;
    const keyword = ctx.query.keyword ? String(ctx.query.keyword).trim() : "";

    let list = subscriptionSystem.listAll();
    if (!isNaN(status)) list = list.filter((sub) => Number(sub.status) === status);
    if (keyword) {
      list = list.filter((sub) => {
        const user = userSystem.getInstance(sub.userUuid);
        const plan = subscriptionSystem.getPlan(sub);
        return (
          sub.uuid.includes(keyword) ||
          (user?.userName || "").includes(keyword) ||
          (plan?.name || "").includes(keyword)
        );
      });
    }
    list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const total = list.length;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    ctx.body = {
      page,
      pageSize,
      maxPage,
      total,
      data: list.slice(start, start + pageSize).map(withUserInfo)
    };
  }
);

// [Admin Permission]
// Subscription detail (with renewal order history).
router.get("/:uuid", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const subscription = subscriptionSystem.getByUuid(String(ctx.params.uuid));
  if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
  ctx.body = withUserInfo(subscription);
});

// [Admin Permission]
// Force-cancel a subscription (stop the instance immediately).
router.post(
  "/:uuid/force-cancel",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    await subscriptionSystem.forceCancel(uuid);
    operationLogger.warning("subscription_force_cancel", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      subscription_id: uuid
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Renew now: deducts the balance when possible, otherwise creates a RENEW
// order and returns its payment link.
router.post(
  "/:uuid/renew-now",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const order = await subscriptionSystem.renewNow(uuid);
    if (order.status === OrderStatus.COMPLETED) {
      operationLogger.warning("subscription_renew_now", {
        operator_ip: ctx.ip,
        operator_name: ctx.session?.["userName"],
        subscription_id: uuid
      });
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
    operationLogger.warning("subscription_renew_now", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      subscription_id: uuid
    });
    ctx.body = {
      order,
      payUrl: result.payUrl,
      gatewayOrderNo: result.gatewayOrderNo,
      paidByBalance: false
    };
  }
);

// [Admin Permission]
// Toggle auto-renew for a subscription.
router.put(
  "/:uuid/auto-renew",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { enabled: Boolean } }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const enabled = Boolean(ctx.request.body.enabled);
    const subscription = subscriptionSystem.getByUuid(uuid);
    if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
    await subscriptionSystem.setAutoRenew(uuid, subscription.userUuid, enabled);
    operationLogger.warning("subscription_auto_renew_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      subscription_id: uuid,
      enabled: String(enabled)
    });
    ctx.body = true;
  }
);

export default router;
