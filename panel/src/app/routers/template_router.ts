import Koa from "koa";
import Router from "@koa/router";
import { PlanType } from "../entity/plan";
import { ROLE } from "../entity/user";
import { TemplateCategory, TemplateType } from "../entity/template";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { operationLogger } from "../service/operation_logger";
import planSystem from "../service/plan_service";
import templateSystem from "../service/template_service";

const router = new Router({ prefix: "/template" });

export function normalizeTemplateInput(body: any): Record<string, any> {
  const name = String(body.name || "").trim();
  if (!name) throw new Error($t("TXT_CODE_TEMPLATE_NAME_REQUIRED"));
  if (name.length > 64) throw new Error($t("TXT_CODE_TEMPLATE_NAME_TOO_LONG"));

  const type = Number(body.type ?? TemplateType.PROCESS);
  if (type !== TemplateType.DOCKER && type !== TemplateType.PROCESS)
    throw new Error($t("TXT_CODE_TEMPLATE_TYPE_INVALID"));

  const category = Number(body.category ?? TemplateCategory.OTHER);
  if (!Object.values(TemplateCategory).includes(category))
    throw new Error($t("TXT_CODE_TEMPLATE_CATEGORY_INVALID"));

  const config: Record<string, any> = {
    name,
    displayName: String(body.displayName || name),
    description: String(body.description || ""),
    type,
    category,
    dockerImage: body.dockerImage ? String(body.dockerImage) : "",
    dockerTag: body.dockerTag ? String(body.dockerTag) : "",
    processCommand: body.processCommand ? String(body.processCommand) : "",
    processArgs: body.processArgs ? String(body.processArgs) : "",
    processEnv:
      body.processEnv && typeof body.processEnv === "object" ? body.processEnv : {},
    version: String(body.version || "1.0.0"),
    author: String(body.author || ""),
    iconUrl: body.iconUrl ? String(body.iconUrl) : "",
    readme: body.readme ? String(body.readme) : "",
    isOfficial: Boolean(body.isOfficial),
    enabled: body.enabled == null ? true : Boolean(body.enabled),
    sortOrder: Number(body.sortOrder ?? 0),
    ports: body.ports || [],
    volumes: body.volumes || []
  };

  if (type === TemplateType.DOCKER && !config.dockerImage)
    throw new Error($t("TXT_CODE_TEMPLATE_IMAGE_REQUIRED"));
  if (type === TemplateType.PROCESS && !config.processCommand)
    throw new Error($t("TXT_CODE_TEMPLATE_COMMAND_REQUIRED"));

  const numericFields = [
    "defaultCpuLimit",
    "defaultMemoryLimit",
    "defaultDiskLimit",
    "defaultUploadLimit",
    "defaultDownloadLimit"
  ] as const;
  for (const field of numericFields) {
    const value = Number(body[field] ?? 0);
    if (isNaN(value) || value < 0 || !Number.isFinite(value))
      throw new Error($t("TXT_CODE_TEMPLATE_LIMIT_INVALID"));
    config[field] = value;
  }
  if (isNaN(config.sortOrder)) config.sortOrder = 0;
  return config;
}

// [Public Permission]
// List templates for the store front (enabled only).
router.get(
  "/list",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    const category = ctx.query.category ? Number(ctx.query.category) : 0;
    const result = templateSystem.list(true).filter((tpl) => {
      if (category && tpl.category !== category) return false;
      return true;
    });
    ctx.body = result;
  }
);

// [Public Permission]
// Template market: enabled templates enriched with the enabled TEMPLATE plans
// that are linked to them, so users can browse a template and pick one of its
// plans to purchase. Templates without any purchasable plan are filtered out.
router.get(
  "/market",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    const category = ctx.query.category ? Number(ctx.query.category) : 0;
    const plans = planSystem.list(true).filter((plan) => plan.type === PlanType.TEMPLATE);
    const result = templateSystem
      .list(true)
      .filter((tpl) => (category ? tpl.category === category : true))
      .map((tpl) => ({
        ...tpl,
        plans: plans.filter((plan) => plan.templateUuid === tpl.uuid)
      }))
      .filter((item) => item.plans.length > 0);
    ctx.body = result;
  }
);

// [Public Permission]
// Get template categories.
router.get(
  "/categories",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    ctx.body = [
      { value: TemplateCategory.MINECRAFT_JAVA, label: $t("TXT_CODE_TEMPLATE_CATEGORY_MINECRAFT_JAVA") },
      { value: TemplateCategory.MINECRAFT_BEDROCK, label: $t("TXT_CODE_TEMPLATE_CATEGORY_MINECRAFT_BEDROCK") },
      { value: TemplateCategory.STEAM_GAME, label: $t("TXT_CODE_TEMPLATE_CATEGORY_STEAM_GAME") },
      { value: TemplateCategory.VOICE_CHAT, label: $t("TXT_CODE_TEMPLATE_CATEGORY_VOICE_CHAT") },
      { value: TemplateCategory.PROXY, label: $t("TXT_CODE_TEMPLATE_CATEGORY_PROXY") },
      { value: TemplateCategory.DATABASE, label: $t("TXT_CODE_TEMPLATE_CATEGORY_DATABASE") },
      { value: TemplateCategory.WEB_SERVICE, label: $t("TXT_CODE_TEMPLATE_CATEGORY_WEB_SERVICE") },
      { value: TemplateCategory.OTHER, label: $t("TXT_CODE_TEMPLATE_CATEGORY_OTHER") }
    ];
  }
);

// [Admin Permission]
// List all templates (management view) with optional category filter.
router.get(
  "/",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    const name = ctx.query.name ? String(ctx.query.name).trim() : "";
    const category = ctx.query.category ? Number(ctx.query.category) : 0;
    const condition: any = {};
    if (name) condition["name"] = `%${name}%`;
    if (category) condition["category"] = category;
    const resultPage = templateSystem.getQueryWrapper().selectPage(condition, page, pageSize);
    ctx.body = resultPage;
  }
);

// [Admin Permission]
// Export a template to portable JSON.
router.get(
  "/export/:uuid",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const data = templateSystem.exportData(uuid);
    if (!data) throw new Error($t("TXT_CODE_TEMPLATE_NOT_FOUND"));
    ctx.body = data;
  }
);

// [Admin Permission]
// Import a template from portable JSON.
router.post(
  "/import",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const body = ctx.request.body;
    const source = body?.template || body;
    if (!source || typeof source !== "object")
      throw new Error($t("TXT_CODE_TEMPLATE_IMPORT_INVALID"));
    const template = await templateSystem.importData(source);
    operationLogger.log("template_import", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      template_id: template.uuid,
      template_name: template.name
    });
    ctx.body = template;
  }
);

// [Public Permission]
// Get template detail.
router.get(
  "/:uuid",
  permission({ token: false, level: null, speedLimit: false }),
  async (ctx: Koa.ParameterizedContext) => {
    const template = templateSystem.getInstance(String(ctx.params.uuid));
    if (!template) throw new Error($t("TXT_CODE_TEMPLATE_NOT_FOUND"));
    ctx.body = template;
  }
);

// [Admin Permission]
// Create template.
router.post(
  "/",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const config = normalizeTemplateInput(ctx.request.body);
    const template = await templateSystem.create(config as any);
    operationLogger.log("template_create", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      template_id: template.uuid,
      template_name: template.name
    });
    ctx.body = template;
  }
);

// [Admin Permission]
// Update template.
router.put(
  "/:uuid",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const template = templateSystem.getInstance(uuid);
    if (!template) throw new Error($t("TXT_CODE_TEMPLATE_NOT_FOUND"));
    const config = normalizeTemplateInput({ ...template, ...ctx.request.body });
    await templateSystem.edit(uuid, config as any);
    operationLogger.log("template_update", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      template_id: uuid,
      template_name: config.name
    });
    ctx.body = templateSystem.getInstance(uuid);
  }
);

// [Admin Permission]
// Enable / disable a template (上架 / 下架).
router.put(
  "/:uuid/status",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { enabled: Boolean } }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const template = templateSystem.getInstance(uuid);
    if (!template) throw new Error($t("TXT_CODE_TEMPLATE_NOT_FOUND"));
    await templateSystem.edit(uuid, { enabled: Boolean(ctx.request.body.enabled) });
    ctx.body = true;
  }
);

// [Admin Permission]
// Clone a template.
router.put(
  "/:uuid/clone",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const template = await templateSystem.clone(uuid);
    operationLogger.log("template_clone", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      template_id: uuid,
      template_name: template.name
    });
    ctx.body = template;
  }
);

// [Admin Permission]
// Delete template.
router.del(
  "/:uuid",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const template = templateSystem.getInstance(uuid);
    if (!template) throw new Error($t("TXT_CODE_TEMPLATE_NOT_FOUND"));
    await templateSystem.deleteInstance(uuid);
    operationLogger.log("template_delete", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      template_id: uuid,
      template_name: template.name
    });
    ctx.body = true;
  }
);

export default router;
