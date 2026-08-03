import Koa from "koa";
import Router from "@koa/router";
import { UserStatus, ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { getInstancesByUuid } from "../service/instance_service";
import { loginSuccess } from "../service/passport_service";
import { operationLogger } from "../service/operation_logger";
import orderSystem from "../service/order_service";
import subscriptionSystem from "../service/subscription_service";
import userSystem from "../service/user_service";

const router = new Router({ prefix: "/users" });

function sanitizeUser(user: any) {
  const copy = JSON.parse(JSON.stringify(user));
  delete copy.passWord;
  delete copy.salt;
  delete copy.secret;
  delete copy.emailVerifyToken;
  return copy;
}

// [Admin Permission]
// Paginated user list with optional keyword / status filters.
router.get(
  "/",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    const keyword = ctx.query.keyword ? String(ctx.query.keyword).trim() : "";
    const status = ctx.query.status != null ? Number(ctx.query.status) : NaN;

    let users = Array.from(userSystem.objects.values());
    if (keyword) {
      users = users.filter(
        (user) => user.userName.includes(keyword) || (user.email || "").includes(keyword)
      );
    }
    if (!isNaN(status)) {
      users = users.filter((user) => Number(user.status) === status);
    }
    users.sort((a, b) => (b.registerTime || "").localeCompare(a.registerTime || ""));

    const total = users.length;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    ctx.body = {
      page,
      pageSize,
      maxPage,
      total,
      data: users.slice(start, start + pageSize).map((user) => sanitizeUser(user))
    };
  }
);

// [Admin Permission]
// User detail including orders, subscriptions and instances.
router.get("/:uuid", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const uuid = String(ctx.params.uuid);
  const user = userSystem.getInstance(uuid);
  if (!user) throw new Error($t("TXT_CODE_ADMIN_USER_NOT_FOUND"));

  const orders = orderSystem.listByUser(uuid, 1, 50).data.map((order) => ({
    uuid: order.uuid,
    planUuid: order.planUuid,
    type: order.type,
    status: order.status,
    amount: order.amount,
    subject: order.subject,
    instanceUuid: order.instanceUuid,
    payTime: order.payTime,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
    remark: order.remark
  }));

  const subscriptions = subscriptionSystem.listByUser(uuid).map((sub) =>
    subscriptionSystem.withPlanInfo(sub)
  );

  let instances: any[] = [];
  try {
    const info = await getInstancesByUuid(uuid, undefined, true);
    instances = info.instances;
  } catch (err) {
    instances = user.instances || [];
  }

  ctx.body = {
    ...sanitizeUser(user),
    orders,
    subscriptions,
    instances
  };
});

// [Admin Permission]
// Modify a user's status (activate / suspend / expire).
router.put(
  "/:uuid/status",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { status: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const user = userSystem.getInstance(uuid);
    if (!user) throw new Error($t("TXT_CODE_ADMIN_USER_NOT_FOUND"));
    const status = Number(ctx.request.body.status);
    if (![UserStatus.PENDING_VERIFY, UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.EXPIRED].includes(status))
      throw new Error($t("TXT_CODE_ADMIN_USER_STATUS_INVALID"));

    const fromStatus = String(user.status);
    await userSystem.edit(uuid, { status });
    operationLogger.warning("user_status_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      target_user_name: user.userName,
      from_status: fromStatus,
      to_status: String(status)
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Adjust a user's balance (recharge / deduct / refund). `change` is in cents
// and may be negative; the final balance is never allowed below zero.
router.put(
  "/:uuid/balance",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { change: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const user = userSystem.getInstance(uuid);
    if (!user) throw new Error($t("TXT_CODE_ADMIN_USER_NOT_FOUND"));
    const change = Number(ctx.request.body.change);
    if (!Number.isFinite(change) || change === 0)
      throw new Error($t("TXT_CODE_ADMIN_BALANCE_INVALID"));
    const newBalance = Math.max(0, (Number(user.balance) || 0) + change);
    await userSystem.edit(uuid, { balance: newBalance });
    operationLogger.warning("user_balance_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      target_user_name: user.userName,
      change: `${change} (-> ${newBalance})`
    });
    ctx.body = { balance: newBalance };
  }
);

// [Admin Permission]
// Impersonate a user: switch the current session to the target user and
// return a fresh token the frontend can use. Logging back in restores the
// administrator session.
router.post(
  "/:uuid/impersonate",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const user = userSystem.getInstance(uuid);
    if (!user) throw new Error($t("TXT_CODE_ADMIN_USER_NOT_FOUND"));
    if (Number(user.permission) >= ROLE.ADMIN)
      throw new Error($t("TXT_CODE_ADMIN_USER_IMPERSONATE_DENIED"));

    const token = loginSuccess(ctx, user.userName);
    operationLogger.warning("user_impersonate", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      target_user_name: user.userName
    });
    ctx.body = {
      token,
      user: {
        uuid: user.uuid,
        userName: user.userName,
        permission: user.permission
      }
    };
  }
);

// [Admin Permission]
// Delete a user (refuses when the user still has active subscriptions).
router.del("/:uuid", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const uuid = String(ctx.params.uuid);
  const user = userSystem.getInstance(uuid);
  if (!user) throw new Error($t("TXT_CODE_ADMIN_USER_NOT_FOUND"));
  const hasActiveSub = subscriptionSystem.listByUser(uuid).some(
    (sub) => Number(sub.status) !== 4
  );
  if (hasActiveSub) throw new Error($t("TXT_CODE_ADMIN_USER_HAS_SUBSCRIPTION"));

  await userSystem.deleteInstance(uuid);
  operationLogger.warning("user_delete", {
    operator_ip: ctx.ip,
    operator_name: ctx.session?.["userName"],
    target_user_name: user.userName
  });
  ctx.body = true;
});

export default router;
