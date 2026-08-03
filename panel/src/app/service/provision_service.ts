// Provisioning service.
// After an order is paid (PAID), this service automatically creates the
// instance on a daemon node and applies the plan resource limits, walking the
// order state machine PAID -> PROVISIONING -> COMPLETED / FAILED.
//
// Resource limit mapping (Docker containers):
//   - cpuLimit    -> docker.cpuUsage            (CPU cores)
//   - memoryLimit -> docker.memory              (MB)
//   - diskLimit   -> docker.maxSpace            (GB)
//   - uploadLimit -> docker.uploadSpeedLimit    (KB/s, tc based)
//   - downloadLimit -> docker.downloadSpeedLimit (KB/s, tc based)
// Native process instances only receive the expiry time (endTime); hardware
// limits are not enforceable there and are logged as a warning.

import { customAlphabet } from "nanoid";
import { BillingCycle, Plan, PlanType } from "../entity/plan";
import { Order, OrderStatus, OrderType } from "../entity/order";
import { Template, TemplateType } from "../entity/template";
import { $t } from "../i18n";
import { sendOrderSuccessEmail } from "./email_service";
import RemoteRequest from "./remote_command";
import RemoteService from "../entity/remote_service";
import RemoteServiceSubsystem from "./remote_service";
import { logger } from "./log";
import orderSystem from "./order_service";
import planSystem from "./plan_service";
import subscriptionSystem from "./subscription_service";
import templateSystem from "./template_service";
import userSystem from "./user_service";

const getNanoId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

// Daemon network limit units are KB/s while plans are expressed in Mbps.
const MBPS_TO_KBS = 1000 / 8; // 1 Mbps = 125 KB/s

const BILLING_CYCLE_MONTHS: Record<number, number> = {
  [BillingCycle.ONCE]: 0,
  [BillingCycle.MONTHLY]: 1,
  [BillingCycle.QUARTERLY]: 3,
  [BillingCycle.YEARLY]: 12
};

class ProvisionSubsystem {
  /**
   * Provision the instance for a paid order. Idempotent: orders that are not
   * in PAID state (already provisioning / completed / failed) are ignored.
   */
  async provision(orderUuid: string): Promise<void> {
    const order = orderSystem.getByUuid(orderUuid);
    if (!order) return;
    if (order.status !== OrderStatus.PAID) return;

    logger.info($t("TXT_CODE_PROVISION_STARTED", { uuid: order.uuid }));

    if (!(await orderSystem.markProvisioning(order.uuid))) return;

    try {
      if (order.type !== OrderType.PURCHASE) {
        throw new Error($t("TXT_CODE_PROVISION_TYPE_UNSUPPORTED"));
      }

      const plan = planSystem.getInstance(order.planUuid);
      if (!plan) throw new Error($t("TXT_CODE_PROVISION_PLAN_NOT_FOUND"));

      const daemon = this.selectDaemon(plan);
      if (!daemon) throw new Error($t("TXT_CODE_PROVISION_NO_DAEMON"));

      const config = await this.buildInstanceConfig(order, plan);

      const result = await new RemoteRequest(daemon).request("instance/new", config);
      const instanceUuid = String(result?.instanceUuid || "");
      if (!instanceUuid) throw new Error($t("TXT_CODE_PROVISION_NO_INSTANCE_ID"));

      const user = userSystem.getInstance(order.userUuid);
      if (!user) throw new Error($t("TXT_CODE_PROVISION_USER_MISSING"));
      await userSystem.edit(order.userUuid, {
        instances: [
          ...user.instances,
          { instanceUuid, daemonId: daemon.uuid }
        ]
      });

      await orderSystem.completeProvision(
        order.uuid,
        instanceUuid,
        daemon.uuid,
        this.formatExpireAt(plan)
      );

      // Notify the user that their instance is ready.
      if (user) {
        await sendOrderSuccessEmail(user, order, plan, instanceUuid);
      }

      // Recurring-billing plans create a subscription so the renewal / expiry
      // lifecycle can be managed by the subscription scheduler.
      if (plan.billingCycle !== BillingCycle.ONCE) {
        const endTime = this.computeEndTime(plan);
        await subscriptionSystem.create({
          userUuid: order.userUuid,
          planUuid: order.planUuid,
          instanceUuid,
          daemonId: daemon.uuid,
          autoRenew: order.autoRenew,
          currentPeriodStart: Date.now(),
          currentPeriodEnd: endTime
        });
      }

      logger.info($t("TXT_CODE_PROVISION_COMPLETED", { uuid: order.uuid, instance: instanceUuid }));
    } catch (error: any) {
      const message = String(error?.message || error);
      await orderSystem.failProvision(order.uuid, message);
      logger.error(
        $t("TXT_CODE_PROVISION_FAILED", {
          uuid: order.uuid,
          err: message
        })
      );
    }
  }

  /**
   * Startup recovery: reprocess orders that were paid but never provisioned
   * (e.g. the panel restarted between the payment callback and provisioning).
   */
  async recoverPendingOrders(): Promise<void> {
    const pending: Order[] = [];
    orderSystem.objects.forEach((order) => {
      if (order.status === OrderStatus.PAID) pending.push(order);
    });
    if (pending.length === 0) return;
    logger.info($t("TXT_CODE_PROVISION_RECOVER", { n: pending.length }));
    for (const order of pending) {
      // Each order is handled independently so a single failure does not stop
      // the recovery of the remaining orders.
      this.provision(order.uuid).catch(() => {});
    }
  }

  private selectDaemon(plan: Plan): RemoteService | null {
    // Preferred node configured on the plan wins when it is reachable.
    if (plan.daemonId) {
      const preferred = RemoteServiceSubsystem.getInstance(plan.daemonId);
      if (preferred && preferred.available) return preferred;
    }
    // Otherwise pick the first available node.
    for (const service of RemoteServiceSubsystem.services.values()) {
      if (service.available) return service;
    }
    return null;
  }

  private async buildInstanceConfig(order: Order, plan: Plan): Promise<Record<string, any>> {
    const base: Record<string, any> = {
      nickname: `${plan.name}-${getNanoId()}`,
      type: "universal",
      startCommand: "",
      stopCommand: "^C",
      endTime: this.computeEndTime(plan)
    };

    if (plan.type === PlanType.TEMPLATE && plan.templateUuid) {
      const template = templateSystem.getInstance(plan.templateUuid);
      if (!template) throw new Error($t("TXT_CODE_PROVISION_TEMPLATE_NOT_FOUND"));
      this.applyTemplate(base, template, plan);
    } else {
      // Predefined instance plan: an empty instance whose resource limits are
      // pre-populated (they take effect once the user switches it to Docker).
      base.processType = "general";
      base.docker = this.buildDockerLimits(plan);
    }

    if (plan.billingCycle !== BillingCycle.ONCE) {
      logger.info(
        $t("TXT_CODE_PROVISION_EXPIRE_NOTE", {
          uuid: order.uuid,
          expire: this.formatExpireAt(plan)
        })
      );
    }
    return base;
  }

  private applyTemplate(config: Record<string, any>, template: Template, plan: Plan) {
    if (template.type === TemplateType.DOCKER) {
      config.processType = "docker";
      const image = template.dockerImage || "";
      const tag = template.dockerTag || "latest";
      config.docker = {
        image: image ? `${image}:${tag}` : "",
        env: Object.entries(template.processEnv || {}).map(([key, value]) => `${key}=${value}`),
        ports: (template.ports || []).map(
          (port) => `${port.containerPort}:${port.containerPort}/${port.protocol}`
        ),
        extraVolumes: [],
        workingDir: "/data",
        changeWorkdir: true,
        ...this.buildDockerLimits(plan)
      };
      // Map declared persistent volumes; anonymous volumes (no host path) are
      // skipped because the daemon requires an explicit host path.
      for (const volume of template.volumes || []) {
        if (volume.hostPath) {
          config.docker.extraVolumes.push(`${volume.hostPath}|${volume.containerPath}`);
        } else {
          logger.warn(
            $t("TXT_CODE_PROVISION_ANONYMOUS_VOLUME_SKIPPED", {
              name: template.displayName || template.name,
              path: volume.containerPath
            })
          );
        }
      }
      config.startCommand = "";
    } else {
      // PROCESS template: only the expiry time is applied; hardware limits are
      // not enforceable on native processes.
      config.processType = "general";
      config.startCommand = [template.processCommand, template.processArgs]
        .filter((v) => v && v.trim())
        .join(" ")
        .trim();
      logger.warn($t("TXT_CODE_PROVISION_PROCESS_LIMIT_WARN"));
    }
  }

  private buildDockerLimits(plan: Plan): Record<string, number> {
    return {
      cpuUsage: Number(plan.cpuLimit) || 0,
      memory: Number(plan.memoryLimit) || 0,
      maxSpace: Number(plan.diskLimit) || 0,
      uploadSpeedLimit: this.mbpsToKbs(plan.uploadLimit),
      downloadSpeedLimit: this.mbpsToKbs(plan.downloadLimit)
    };
  }

  private mbpsToKbs(mbps: number): number {
    const value = Number(mbps) || 0;
    return value > 0 ? Math.round(value * MBPS_TO_KBS) : 0;
  }

  private computeEndTime(plan: Plan): number {
    const months = BILLING_CYCLE_MONTHS[Number(plan.billingCycle)] ?? 0;
    if (months <= 0) return 0;
    const now = new Date();
    return now.setMonth(now.getMonth() + months);
  }

  private formatExpireAt(plan: Plan): string {
    const endTime = this.computeEndTime(plan);
    return endTime > 0 ? new Date(endTime).toLocaleString() : "";
  }
}

export default new ProvisionSubsystem();
