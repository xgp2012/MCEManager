import Koa from "koa";
import Router from "@koa/router";
import { Plan, BillingCycle, PlanType } from "../entity/plan";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { operationLogger } from "../service/operation_logger";
import planSystem from "../service/plan_service";
import templateSystem from "../service/template_service";

const router = new Router({ prefix: "/plan" });

function normalizePlanInput(body: any): Partial<Plan> {
  const name = String(body.name || "").trim();
  if (!name) throw new Error($t("TXT_CODE_PLAN_NAME_REQUIRED"));
  if (name.length > 64) throw new Error($t("TXT_CODE_PLAN_NAME_TOO_LONG"));

  const price = Number(body.price ?? 0);
  if (isNaN(price) || price < 0 || !Number.isFinite(price))
    throw new Error($t("TXT_CODE_PLAN_PRICE_INVALID"));

  const type = Number(body.type ?? PlanType.INSTANCE);
  if (![PlanType.INSTANCE, PlanType.TEMPLATE, PlanType.CUSTOM].includes(type))
    throw new Error($t("TXT_CODE_PLAN_TYPE_INVALID"));

  const billingCycle = Number(body.billingCycle ?? BillingCycle.ONCE);
  if (![BillingCycle.ONCE, BillingCycle.MONTHLY, BillingCycle.QUARTERLY, BillingCycle.YEARLY].includes(billingCycle))
    throw new Error($t("TXT_CODE_PLAN_CYCLE_INVALID"));

  const numericFields = [
    "cpuLimit",
    "memoryLimit",
    "diskLimit",
    "uploadLimit",
    "downloadLimit",
    "sortOrder"
  ] as const;
  const result: Partial<Plan> = {
    name,
    description: String(body.description || ""),
    type,
    price,
    billingCycle,
    enabled: body.enabled == null ? true : Boolean(body.enabled)
  };
  for (const field of numericFields) {
    const value = Number(body[field] ?? 0);
    if (isNaN(value) || value < 0 || !Number.isFinite(value))
      throw new Error($t("TXT_CODE_PLAN_LIMIT_INVALID"));
    result[field] = value;
  }

  // In TEMPLATE mode, the linked template must exist.
  const templateUuid = body.templateUuid ? String(body.templateUuid) : "";
  if (type === PlanType.TEMPLATE) {
    if (!templateUuid || !templateSystem.getInstance(templateUuid))
      throw new Error($t("TXT_CODE_PLAN_TEMPLATE_REQUIRED"));
  }
  result.templateUuid = templateUuid;
  result.daemonId = body.daemonId ? String(body.daemonId) : "";
  return result;
}

// [Public Permission]
// List plans for the store front (enabled plans only).
router.get(
  "/list",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    ctx.body = planSystem.list(true);
  }
);

// [Admin Permission]
// List all plans including disabled ones (management view).
router.get(
  "/",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    const name = ctx.query.name ? String(ctx.query.name).trim() : "";
    const condition: any = {};
    if (name) condition["name"] = `%${name}%`;
    const resultPage = planSystem.getQueryWrapper().selectPage(condition, page, pageSize);
    ctx.body = resultPage;
  }
);

// [Public Permission]
// Get plan detail.
router.get(
  "/:uuid",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    const plan = planSystem.getInstance(String(ctx.params.uuid));
    if (!plan) throw new Error($t("TXT_CODE_PLAN_NOT_FOUND"));
    ctx.body = plan;
  }
);

// [Admin Permission]
// Create plan.
router.post(
  "/",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const config = normalizePlanInput(ctx.request.body);
    const plan = await planSystem.create(config);
    operationLogger.log("plan_create", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      plan_id: plan.uuid,
      plan_name: plan.name
    });
    ctx.body = plan;
  }
);

// [Admin Permission]
// Update plan.
router.put(
  "/:uuid",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const plan = planSystem.getInstance(uuid);
    if (!plan) throw new Error($t("TXT_CODE_PLAN_NOT_FOUND"));
    const body = ctx.request.body;
    // Merge the existing plan with the incoming partial payload so optional
    // fields can be updated independently.
    const config = normalizePlanInput({ ...plan, ...body });
    await planSystem.edit(uuid, config);
    operationLogger.log("plan_update", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      plan_id: uuid,
      plan_name: config.name
    });
    ctx.body = planSystem.getInstance(uuid);
  }
);

// [Admin Permission]
// Delete plan.
router.del(
  "/:uuid",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const plan = planSystem.getInstance(uuid);
    if (!plan) throw new Error($t("TXT_CODE_PLAN_NOT_FOUND"));
    await planSystem.deleteInstance(uuid);
    operationLogger.log("plan_delete", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      plan_id: uuid,
      plan_name: plan.name
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Enable / disable a plan (上架 / 下架).
router.put(
  "/:uuid/status",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { enabled: Boolean } }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const plan = planSystem.getInstance(uuid);
    if (!plan) throw new Error($t("TXT_CODE_PLAN_NOT_FOUND"));
    await planSystem.edit(uuid, { enabled: Boolean(ctx.request.body.enabled) });
    ctx.body = true;
  }
);

export default router;
