import Koa from "koa";
import Router from "@koa/router";
import { OrderStatus, OrderType } from "../entity/order";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { operationLogger } from "../service/operation_logger";
import orderSystem from "../service/order_service";
import planSystem from "../service/plan_service";
import provisionService from "../service/provision_service";
import userSystem from "../service/user_service";

const router = new Router({ prefix: "/orders" });

function withUserInfo(order: any) {
  const user = userSystem.getInstance(order.userUuid);
  const plan = planSystem.getInstance(order.planUuid);
  const copy = JSON.parse(JSON.stringify(order));
  copy.userName = user?.userName || "";
  copy.userEmail = user?.email || "";
  copy.planName = plan?.name || "";
  return copy;
}

// [Admin Permission]
// All orders with optional status / type / keyword filters.
router.get(
  "/",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    const status = ctx.query.status != null ? Number(ctx.query.status) : NaN;
    const type = ctx.query.type != null ? Number(ctx.query.type) : NaN;
    const keyword = ctx.query.keyword ? String(ctx.query.keyword).trim() : "";
    const result = orderSystem.listAllFiltered(page, pageSize, {
      status: isNaN(status) ? undefined : status,
      type: isNaN(type) ? undefined : type,
      keyword: keyword || undefined
    });
    result.data = result.data.map(withUserInfo);
    ctx.body = result;
  }
);

// [Admin Permission]
// Order detail (includes the raw callback payload).
router.get("/:uuid", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const order = orderSystem.getByUuid(String(ctx.params.uuid));
  if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
  const detail: any = withUserInfo(order);
  if (order.payRawData) {
    try {
      detail.payRawParsed = JSON.parse(order.payRawData);
    } catch (err) {
      detail.payRawParsed = null;
    }
  }
  ctx.body = detail;
});

// [Admin Permission]
// Retry a failed provisioning.
router.post(
  "/:uuid/retry-provision",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const order = orderSystem.getByUuid(uuid);
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    await orderSystem.retryProvision(uuid);
    provisionService.provision(uuid).catch(() => {});
    operationLogger.warning("order_retry_provision", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      order_id: uuid
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Refund an order (mark + manual handling).
router.post(
  "/:uuid/refund",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { reason: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const reason = ctx.request.body.reason ? String(ctx.request.body.reason) : "";
    await orderSystem.markRefunded(uuid, reason);
    operationLogger.warning("order_refund", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      order_id: uuid
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Manually mark a pending order as paid (人工核对后).
router.post(
  "/:uuid/mark-paid",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const order = orderSystem.getByUuid(uuid);
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    await orderSystem.markPaid(uuid);
    if (order.type === OrderType.PURCHASE) {
      provisionService.provision(uuid).catch(() => {});
    }
    operationLogger.warning("order_mark_paid", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      order_id: uuid
    });
    ctx.body = true;
  }
);

export default router;
