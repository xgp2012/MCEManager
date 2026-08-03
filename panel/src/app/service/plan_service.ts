import { LocalFileSource, QueryWrapper } from "mcsmanager-common";
import { v4 } from "uuid";
import Storage from "../common/storage/sys_storage";
import { Plan } from "../entity/plan";
import { logger } from "./log";
import { $t } from "../i18n";

class PlanSubsystem {
  public readonly objects: Map<string, Plan> = new Map();

  async initialize() {
    for (const uuid of await Storage.getStorage().list("Plan")) {
      const plan = (await Storage.getStorage().load("Plan", Plan, uuid)) as Plan;
      this.objects.set(uuid, plan);
    }
    logger.info($t("TXT_CODE_PLAN_LOADED", { n: this.objects.size }));
  }

  async create(config: Partial<Plan>): Promise<Plan> {
    const uuid = v4().replace(/-/gim, "");
    const now = new Date().toLocaleString();
    const plan = new Plan();
    plan.uuid = uuid;
    plan.createdAt = now;
    plan.updatedAt = now;
    this.objects.set(uuid, plan);
    await this.edit(uuid, config);
    await Storage.getStorage().store("Plan", uuid, plan);
    return plan;
  }

  async edit(uuid: string, config: Partial<Plan>) {
    const plan = this.getInstance(uuid);
    if (!plan) throw new Error($t("TXT_CODE_PLAN_NOT_FOUND"));
    if (config.name != null) plan.name = String(config.name);
    if (config.description != null) plan.description = String(config.description);
    if (config.type != null) plan.type = Number(config.type);
    if (config.price != null) plan.price = Number(config.price);
    if (config.billingCycle != null) plan.billingCycle = Number(config.billingCycle);
    if (config.cpuLimit != null) plan.cpuLimit = Number(config.cpuLimit);
    if (config.memoryLimit != null) plan.memoryLimit = Number(config.memoryLimit);
    if (config.diskLimit != null) plan.diskLimit = Number(config.diskLimit);
    if (config.uploadLimit != null) plan.uploadLimit = Number(config.uploadLimit);
    if (config.downloadLimit != null) plan.downloadLimit = Number(config.downloadLimit);
    if (config.templateUuid != null) plan.templateUuid = String(config.templateUuid);
    if (config.daemonId != null) plan.daemonId = String(config.daemonId);
    if (config.enabled != null) plan.enabled = Boolean(config.enabled);
    if (config.sortOrder != null) plan.sortOrder = Number(config.sortOrder);
    plan.updatedAt = new Date().toLocaleString();
    await Storage.getStorage().store("Plan", uuid, plan);
  }

  async deleteInstance(uuid: string) {
    if (this.objects.has(uuid)) {
      this.objects.delete(uuid);
      await Storage.getStorage().delete("Plan", uuid);
    }
  }

  getInstance(uuid: string) {
    return this.objects.get(uuid) || null;
  }

  getQueryWrapper() {
    return new QueryWrapper(new LocalFileSource<Plan>(this.objects));
  }

  /**
   * List plans. If onlyEnabled is true, disabled plans are excluded.
   */
  list(onlyEnabled = false): Plan[] {
    const result: Plan[] = [];
    this.objects.forEach((plan) => {
      if (onlyEnabled && !plan.enabled) return;
      result.push(plan);
    });
    result.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    return result;
  }
}

export default new PlanSubsystem();
