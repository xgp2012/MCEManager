import Koa from "koa";
import Router from "@koa/router";
import { OrderStatus } from "../entity/order";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { operationLogger } from "../service/operation_logger";
import orderSystem from "../service/order_service";
import userSystem from "../service/user_service";

const router = new Router({ prefix: "/logs" });

// [Admin Permission]
// Operation log query with pagination and filters.
router.get(
  "/operation",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 20));
    const level = ctx.query.level ? String(ctx.query.level) : "";
    const type = ctx.query.type ? String(ctx.query.type) : "";
    const keyword = ctx.query.keyword ? String(ctx.query.keyword).trim() : "";
    ctx.body = await operationLogger.getPage(page, pageSize, {
      level: level || undefined,
      type: type || undefined,
      keyword: keyword || undefined
    });
  }
);

// [Admin Permission]
// Payment log query (built from orders that have been paid).
router.get(
  "/payment",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(ctx.query.page_size) || 20));
    const gateway = ctx.query.gateway ? String(ctx.query.gateway) : "";
    const status = ctx.query.status != null ? Number(ctx.query.status) : NaN;

    const entries: any[] = [];
    orderSystem.objects.forEach((order) => {
      if (!order.payTime && !order.payGateway) return;
      if (gateway && order.payGateway !== gateway) return;
      if (!isNaN(status) && order.status !== status) return;
      const user = userSystem.getInstance(order.userUuid);
      entries.push({
        uuid: order.uuid,
        userUuid: order.userUuid,
        userName: user?.userName || "",
        amount: order.amount,
        currency: order.currency,
        subject: order.subject,
        payGateway: order.payGateway,
        payOrderNo: order.payOrderNo,
        payTime: order.payTime,
        status: order.status,
        type: order.type
      });
    });
    entries.sort((a, b) => String(b.payTime).localeCompare(String(a.payTime)));

    const total = entries.length;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    ctx.body = {
      page,
      pageSize,
      maxPage,
      total,
      data: entries.slice(start, start + pageSize)
    };
  }
);

// [Admin Permission]
// Operation log export as CSV with the same filters as the page query.
// Returns a plain CSV string; the protocol middleware wraps it into the panel envelope.
router.get(
  "/operation/export",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const level = ctx.query.level ? String(ctx.query.level) : "";
    const type = ctx.query.type ? String(ctx.query.type) : "";
    const keyword = ctx.query.keyword ? String(ctx.query.keyword).trim() : "";
    const items = await operationLogger.queryAll({
      level: level || undefined,
      type: type || undefined,
      keyword: keyword || undefined
    });
    ctx.body = toCSV(
      ["time", "level", "type", "operator", "ip", "target"],
      items.map((item) => {
        const anyItem = item as any;
        return [
          formatTime(anyItem.operation_time),
          item.operation_level,
          item.type,
          anyItem.operator_name || anyItem.operation_id || "",
          anyItem.operator_ip || "",
          anyItem.target_user_name || anyItem.instance_name || anyItem.order_id || anyItem.subscription_id || anyItem.daemon_id || ""
        ];
      })
    );
  }
);

// [Admin Permission]
// Payment log export as CSV.
router.get(
  "/payment/export",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const gateway = ctx.query.gateway ? String(ctx.query.gateway) : "";
    const status = ctx.query.status != null ? Number(ctx.query.status) : NaN;

    const rows: string[][] = [];
    orderSystem.objects.forEach((order) => {
      if (!order.payTime && !order.payGateway) return;
      if (gateway && order.payGateway !== gateway) return;
      if (!isNaN(status) && order.status !== status) return;
      const user = userSystem.getInstance(order.userUuid);
      rows.push([
        formatTime(order.payTime),
        order.uuid,
        user?.userName || "",
        order.subject,
        String(order.amount / 100),
        order.currency,
        order.payGateway || "",
        String(order.status),
        String(order.type)
      ]);
    });
    rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

    ctx.body = toCSV(
      ["payTime", "orderUuid", "userName", "subject", "amount", "currency", "gateway", "status", "type"],
      rows
    );
  }
);

function formatTime(value: string | number | undefined): string {
  if (!value) return "";
  const date = new Date(Number(value));
  return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  return lines.join("\r\n");
}

export default router;
