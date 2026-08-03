// Subscription subsystem.
//
// A subscription is created automatically when a recurring-billing plan is
// purchased and provisioned. This service owns the renewal state machine and
// the periodic billing scheduler:
//
//   - On period end with auto-renew enabled, the plan price is deducted from
//     the user balance. If the balance is insufficient, a RENEW order is
//     created so the user can pay manually, and the balance deduction is
//     retried after 1 / 3 / 7 days. After 3 failed retries the subscription
//     becomes PAST_DUE and the instance is stopped.
//   - When a subscription stops (PAST_DUE / EXPIRED) the instance data is
//     retained for 3 days. If it is not renewed within that window the
//     instance and its files are deleted.
//   - Renewing (via balance, a paid RENEW order, or the manual renew endpoint)
//     extends the billing period, re-applies the daemon instance endTime and
//     restarts the instance.
//
// Timestamps used by the scheduler are epoch milliseconds (numbers) so they can
// be compared reliably; createdAt / updatedAt follow the project convention and
// use the locale string format.

import { LocalFileSource, QueryWrapper } from "mcsmanager-common";
import schedule from "node-schedule";
import { v4 } from "uuid";
import Storage from "../common/storage/sys_storage";
import { BillingCycle, Plan } from "../entity/plan";
import { Order, OrderStatus, OrderType } from "../entity/order";
import { Subscription, SubscriptionStatus } from "../entity/subscription";
import { $t } from "../i18n";
import { sendExpiryReminderEmail, sendPaymentFailureEmail } from "./email_service";
import RemoteRequest from "./remote_command";
import RemoteServiceSubsystem from "./remote_service";
import { logger } from "./log";
import orderSystem from "./order_service";
import planSystem from "./plan_service";
import userSystem from "./user_service";
import { systemConfig } from "../setting";

const DATA_RETENTION_DAYS = 3;
const DATA_RETENTION_MS = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// Balance deduction retry schedule in days after a failed auto-renewal.
const RETRY_INTERVAL_DAYS = [1, 3, 7];
const MAX_RETRIES = 3;

// Instance status constants from the daemon.
const INSTANCE_STATUS_BUSY = -1;
const INSTANCE_STATUS_STOP = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

class SubscriptionSubsystem {
  public readonly objects: Map<string, Subscription> = new Map();

  private schedulerStarted = false;
  private schedulerRunning = false;

  async initialize() {
    for (const uuid of await Storage.getStorage().list("Subscription")) {
      const subscription = (await Storage.getStorage().load(
        "Subscription",
        Subscription,
        uuid
      )) as Subscription;
      this.objects.set(uuid, subscription);
    }
    logger.info($t("TXT_CODE_SUBSCRIPTION_LOADED", { n: this.objects.size }));
  }

  async create(data: {
    userUuid: string;
    planUuid: string;
    instanceUuid: string;
    daemonId: string;
    autoRenew: boolean;
    currentPeriodStart: number;
    currentPeriodEnd: number;
  }): Promise<Subscription> {
    const uuid = v4().replace(/-/gim, "");
    const now = new Date().toLocaleString();
    const subscription = new Subscription();
    subscription.uuid = uuid;
    subscription.userUuid = data.userUuid;
    subscription.planUuid = data.planUuid;
    subscription.instanceUuid = data.instanceUuid;
    subscription.daemonId = data.daemonId;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.currentPeriodStart = Number(data.currentPeriodStart);
    subscription.currentPeriodEnd = Number(data.currentPeriodEnd);
    subscription.autoRenew = Boolean(data.autoRenew);
    subscription.cancelAtPeriodEnd = !subscription.autoRenew;
    subscription.nextPaymentAt = subscription.currentPeriodEnd;
    subscription.createdAt = now;
    subscription.updatedAt = now;
    this.objects.set(uuid, subscription);
    await Storage.getStorage().store("Subscription", uuid, subscription);
    logger.info($t("TXT_CODE_SUBSCRIPTION_CREATED", { uuid }));
    return subscription;
  }

  async save(subscription: Subscription) {
    subscription.updatedAt = new Date().toLocaleString();
    await Storage.getStorage().store("Subscription", subscription.uuid, subscription);
  }

  getByUuid(uuid: string) {
    return this.objects.get(uuid) || null;
  }

  listByUser(userUuid: string): Subscription[] {
    const result: Subscription[] = [];
    this.objects.forEach((subscription) => {
      if (subscription.userUuid === userUuid) result.push(subscription);
    });
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return result;
  }

  listAll(): Subscription[] {
    return Array.from(this.objects.values());
  }

  getQueryWrapper() {
    return new QueryWrapper(new LocalFileSource<Subscription>(this.objects));
  }

  getPlan(subscription: Subscription): Plan | null {
    return subscription ? planSystem.getInstance(subscription.planUuid) : null;
  }

  /**
   * Locate the subscription that owns a renewal order (matched by the
   * user / plan / instance carried on the order).
   */
  findByOrder(order: Order): Subscription | null {
    if (!order || !order.instanceUuid) return null;
    for (const subscription of this.objects.values()) {
      if (
        subscription.userUuid === order.userUuid &&
        subscription.planUuid === order.planUuid &&
        subscription.instanceUuid === order.instanceUuid
      )
        return subscription;
    }
    return null;
  }

  /**
   * A subscription is terminated once its data-retention grace has passed.
   * Terminated subscriptions can no longer be renewed.
   */
  isTerminated(subscription: Subscription): boolean {
    if (!subscription) return true;
    if (subscription.status !== SubscriptionStatus.EXPIRED) return false;
    if (subscription.graceExpireAt > 0 && subscription.graceExpireAt > Date.now()) return false;
    return true;
  }

  isRenewable(subscription: Subscription): boolean {
    if (!subscription) return false;
    if (subscription.status === SubscriptionStatus.EXPIRED)
      return !this.isTerminated(subscription);
    return true;
  }

  /**
   * Enrich a subscription with a snapshot of its linked plan for display.
   */
  withPlanInfo(subscription: Subscription) {
    const plan = this.getPlan(subscription);
    return {
      ...subscription,
      planName: plan?.name || "",
      planPrice: Number(plan?.price) || 0,
      planCycle: Number(plan?.billingCycle) || 0,
      planType: Number(plan?.type) || 0
    };
  }

  // ----------------------------------------------------------------
  // User actions
  // ----------------------------------------------------------------

  /**
   * Cancel auto-renewal: the subscription keeps running until the current
   * period ends, then it expires and its data is retained for 3 days.
   */
  async cancel(uuid: string, userUuid: string): Promise<boolean> {
    const subscription = this.getByUuid(uuid);
    if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
    if (subscription.userUuid !== userUuid)
      throw new Error($t("TXT_CODE_SUBSCRIPTION_ACCESS_DENIED"));
    if (this.isTerminated(subscription))
      throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_RENEWABLE"));
    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.autoRenew = false;
    subscription.cancelAtPeriodEnd = true;
    await this.save(subscription);
    logger.info($t("TXT_CODE_SUBSCRIPTION_CANCELLED", { uuid: subscription.uuid }));
    return true;
  }

  /**
   * Toggle auto-renewal. Disabling marks the subscription as cancelled at the
   * period end; enabling reactivates it (only while it is still renewable).
   */
  async setAutoRenew(uuid: string, userUuid: string, enabled: boolean): Promise<boolean> {
    const subscription = this.getByUuid(uuid);
    if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
    if (subscription.userUuid !== userUuid)
      throw new Error($t("TXT_CODE_SUBSCRIPTION_ACCESS_DENIED"));
    if (this.isTerminated(subscription))
      throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_RENEWABLE"));
    subscription.autoRenew = Boolean(enabled);
    subscription.cancelAtPeriodEnd = !subscription.autoRenew;
    if (subscription.autoRenew && subscription.status === SubscriptionStatus.CANCELLED) {
      subscription.status = SubscriptionStatus.ACTIVE;
    }
    await this.save(subscription);
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_AUTO_RENEW_UPDATED", {
        uuid: subscription.uuid,
        enabled: String(subscription.autoRenew)
      })
    );
    return true;
  }

  /**
   * Manual renewal: prefer the user balance, otherwise create (or reuse) a
   * RENEW order that must be paid through the payment gateway.
   *
   * @returns the resulting order. A COMPLETED order means the balance covered
   *          the price; a PENDING order still needs to be paid.
   */
  async renew(uuid: string, userUuid: string): Promise<Order> {
    const subscription = this.getByUuid(uuid);
    if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
    if (subscription.userUuid !== userUuid)
      throw new Error($t("TXT_CODE_SUBSCRIPTION_ACCESS_DENIED"));
    if (!this.isRenewable(subscription))
      throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_RENEWABLE"));
    const plan = this.getPlan(subscription);
    if (!plan) throw new Error($t("TXT_CODE_SUBSCRIPTION_PLAN_NOT_FOUND"));
    const price = Number(plan.price) || 0;
    if (price <= 0) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_RENEWABLE"));

    const user = userSystem.getInstance(subscription.userUuid);
    if (user && Number(user.balance) >= price) {
      return this.renewByBalance(subscription);
    }
    return this.createRenewOrder(subscription);
  }

  /**
   * Renew using the user balance: deducts the price, extends the period and
   * records a COMPLETED RENEW order (payGateway = "balance") for the audit
   * trail.
   */
  async renewByBalance(subscription: Subscription): Promise<Order> {
    const plan = this.getPlan(subscription);
    if (!plan) throw new Error($t("TXT_CODE_SUBSCRIPTION_PLAN_NOT_FOUND"));
    const price = Number(plan.price) || 0;
    if (!(await this.deductBalance(subscription.userUuid, price)))
      throw new Error($t("TXT_CODE_SUBSCRIPTION_BALANCE_INSUFFICIENT"));

    const now = Date.now();
    const newEnd = this.extendPeriodMs(subscription, this.cycleMonths(plan));
    subscription.currentPeriodStart =
      subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
    subscription.currentPeriodEnd = newEnd;
    subscription.lastPaymentAt = now;
    subscription.nextPaymentAt = newEnd;
    subscription.failedPaymentCount = 0;
    subscription.graceExpireAt = 0;
    subscription.reminderSentAt = 0;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.autoRenew = true;
    subscription.cancelAtPeriodEnd = false;
    await this.save(subscription);
    await this.cancelPendingRenewOrders(subscription);

    await this.applyInstanceEndTime(subscription, newEnd);
    await this.resumeInstance(subscription);

    const order = await this.createRenewRecord(subscription, plan, price, "balance");
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_RENEW_BALANCE", {
        uuid: subscription.uuid,
        amount: price
      })
    );
    return order;
  }

  /**
   * Create a PENDING RENEW order for the subscription (reuses an existing
   * pending order to avoid duplicates).
   */
  async createRenewOrder(subscription: Subscription): Promise<Order> {
    const plan = this.getPlan(subscription);
    if (!plan) throw new Error($t("TXT_CODE_SUBSCRIPTION_PLAN_NOT_FOUND"));

    const existing = orderSystem.findPendingRenew(
      subscription.userUuid,
      subscription.planUuid,
      subscription.instanceUuid
    );
    if (existing) return existing;

    const price = Number(plan.price) || 0;
    const order = await orderSystem.create({
      userUuid: subscription.userUuid,
      planUuid: subscription.planUuid,
      type: OrderType.RENEW,
      amount: price,
      subject: `${plan.name} - ${$t("TXT_CODE_SUBSCRIPTION_RENEW_SUBJECT")}`,
      autoRenew: subscription.autoRenew
    });
    // Link the order to the subscription instance so the payment callback can
    // resolve the subscription later.
    order.instanceUuid = subscription.instanceUuid;
    order.daemonId = subscription.daemonId;
    await orderSystem.save(order);
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_ORDER_CREATED", {
        order: order.uuid,
        sub: subscription.uuid
      })
    );
    return order;
  }

  /**
   * Finalize a renewal after its RENEW order has been paid through the
   * payment gateway (dispatched from the pay callback / return handler).
   */
  async renewFromOrder(orderUuid: string): Promise<void> {
    const order = orderSystem.getByOrderNo(orderUuid);
    if (!order) return;
    if (order.type !== OrderType.RENEW) return;

    const subscription = this.findByOrder(order);
    if (!subscription || this.isTerminated(subscription)) {
      await orderSystem.failRenew(order.uuid, $t("TXT_CODE_SUBSCRIPTION_ORDER_SUB_MISSING"));
      logger.warn(
        $t("TXT_CODE_SUBSCRIPTION_ORDER_SUB_MISSING_WARN", { order: order.uuid })
      );
      return;
    }
    const plan = this.getPlan(subscription);
    if (!plan) {
      await orderSystem.failRenew(order.uuid, $t("TXT_CODE_SUBSCRIPTION_PLAN_NOT_FOUND"));
      return;
    }

    const now = Date.now();
    const newEnd = this.extendPeriodMs(subscription, this.cycleMonths(plan));
    subscription.currentPeriodStart =
      subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
    subscription.currentPeriodEnd = newEnd;
    subscription.lastPaymentAt = now;
    subscription.nextPaymentAt = newEnd;
    subscription.failedPaymentCount = 0;
    subscription.graceExpireAt = 0;
    subscription.reminderSentAt = 0;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.cancelAtPeriodEnd = false;
    subscription.autoRenew = order.autoRenew;
    await this.save(subscription);
    await this.cancelPendingRenewOrders(subscription, order.uuid);

    await this.applyInstanceEndTime(subscription, newEnd);
    await this.resumeInstance(subscription);

    await orderSystem.completeRenew(order.uuid, this.formatMs(newEnd));
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_RENEWED", {
        uuid: subscription.uuid,
        end: this.formatMs(newEnd)
      })
    );
  }

  // ----------------------------------------------------------------
  // Admin actions
  // ----------------------------------------------------------------

  /**
   * Force-cancel a subscription (admin): the instance is stopped immediately,
   * the subscription becomes EXPIRED and its data-retention grace starts now.
   */
  async forceCancel(uuid: string): Promise<boolean> {
    const subscription = this.getByUuid(uuid);
    if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
    if (this.isTerminated(subscription))
      throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_RENEWABLE"));
    await this.stopInstance(subscription);
    subscription.status = SubscriptionStatus.EXPIRED;
    subscription.autoRenew = false;
    subscription.cancelAtPeriodEnd = true;
    subscription.nextPaymentAt = 0;
    subscription.graceExpireAt = Date.now();
    await this.save(subscription);
    logger.warn($t("TXT_CODE_SUBSCRIPTION_FORCE_CANCELLED", { uuid: subscription.uuid }));
    return true;
  }

  /**
   * Force a renewal now (admin): renews via the balance when possible,
   * otherwise creates a RENEW order for the payment gateway.
   */
  async renewNow(uuid: string): Promise<Order> {
    const subscription = this.getByUuid(uuid);
    if (!subscription) throw new Error($t("TXT_CODE_SUBSCRIPTION_NOT_FOUND"));
    const plan = this.getPlan(subscription);
    if (!plan) throw new Error($t("TXT_CODE_SUBSCRIPTION_PLAN_NOT_FOUND"));
    const price = Number(plan.price) || 0;
    const user = userSystem.getInstance(subscription.userUuid);
    if (user && Number(user.balance) >= price) {
      return this.renewByBalance(subscription);
    }
    return this.createRenewOrder(subscription);
  }

  // ----------------------------------------------------------------
  // Scheduler
  // ----------------------------------------------------------------

  /**
   * Start the periodic billing job. The first tick runs immediately so that
   * renewals / expirations that happened while the panel was offline are
   * processed (catch-up), then the job runs once per minute.
   */
  startScheduler() {
    if (this.schedulerStarted) return;
    this.schedulerStarted = true;
    this.schedulerTick().catch((err) =>
      logger.error(
        $t("TXT_CODE_SUBSCRIPTION_TICK_FAILED", {
          err: String((err as any)?.message || err)
        })
      )
    );
    schedule.scheduleJob("*/1 * * * *", () => {
      if (this.schedulerRunning) return;
      this.schedulerRunning = true;
      this.schedulerTick()
        .catch((err) =>
          logger.error(
            $t("TXT_CODE_SUBSCRIPTION_TICK_FAILED", {
              err: String((err as any)?.message || err)
            })
          )
        )
        .finally(() => {
          this.schedulerRunning = false;
        });
    });
  }

  async schedulerTick() {
    const now = Date.now();
    for (const subscription of this.objects.values()) {
      try {
        await this.processSubscription(subscription, now);
      } catch (err) {
        logger.error(
          $t("TXT_CODE_SUBSCRIPTION_TICK_FAILED", {
            err: String((err as any)?.message || err)
          })
        );
      }
    }
  }

  private async processSubscription(subscription: Subscription, now: number) {
    if (subscription.status === SubscriptionStatus.EXPIRED) {
      await this.handleExpired(subscription, now);
      return;
    }
    if (subscription.status === SubscriptionStatus.PAST_DUE) {
      await this.handlePastDue(subscription, now);
      return;
    }

    // ACTIVE / CANCELLED: send the expiry reminder once per billing period
    // when the subscription enters the reminder window (expiryReminderDays).
    if (
      (subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.CANCELLED) &&
      subscription.reminderSentAt < subscription.currentPeriodStart
    ) {
      await this.maybeSendExpiryReminder(subscription, now);
    }

    // ACTIVE / CANCELLED: the paid period has ended and no renewal attempt is
    // in flight yet -> trigger the renewal / expiry handling once.
    const periodEnded =
      subscription.currentPeriodEnd > 0 && now >= subscription.currentPeriodEnd;
    if (
      periodEnded &&
      subscription.nextPaymentAt === 0 &&
      subscription.failedPaymentCount === 0
    ) {
      await this.handlePeriodEnd(subscription, now);
      return;
    }

    // A failed auto-renewal is scheduled for a balance retry.
    if (
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.nextPaymentAt > 0 &&
      now >= subscription.nextPaymentAt
    ) {
      await this.retryRenewal(subscription, now);
    }
  }

  /**
   * Send the "expiring soon" reminder email exactly once per period when the
   * subscription enters the configured reminder window.
   */
  private async maybeSendExpiryReminder(subscription: Subscription, now: number) {
    const days = Math.max(1, Number(systemConfig?.expiryReminderDays) || 3);
    const windowStart = subscription.currentPeriodEnd - days * DAY_MS;
    if (now < windowStart || now >= subscription.currentPeriodEnd) return;
    const user = userSystem.getInstance(subscription.userUuid);
    if (!user?.email) return;
    const plan = this.getPlan(subscription);
    subscription.reminderSentAt = now;
    await this.save(subscription);
    await sendExpiryReminderEmail(
      user,
      subscription,
      plan,
      (subscription.currentPeriodEnd - now) / DAY_MS
    );
  }

  /**
   * Period ended. With auto-renewal on, try the balance first; otherwise the
   * subscription expires and its data is retained for 3 days.
   */
  private async handlePeriodEnd(subscription: Subscription, now: number) {
    const renew = subscription.autoRenew && !subscription.cancelAtPeriodEnd;
    if (!renew) {
      await this.stopInstance(subscription);
      subscription.status = SubscriptionStatus.EXPIRED;
      subscription.graceExpireAt = now + DATA_RETENTION_MS;
      await this.save(subscription);
      logger.info(
        $t("TXT_CODE_SUBSCRIPTION_EXPIRED", {
          uuid: subscription.uuid,
          date: this.formatMs(subscription.graceExpireAt)
        })
      );
      return;
    }

    if (await this.tryRenewByBalance(subscription, now)) return;

    // Balance is insufficient: hand over to a manual order and start retrying
    // the balance deduction.
    subscription.failedPaymentCount = Math.max(1, subscription.failedPaymentCount + 1);
    subscription.nextPaymentAt = now + RETRY_INTERVAL_DAYS[0] * DAY_MS;
    await this.save(subscription);
    try {
      await this.createRenewOrder(subscription);
    } catch (err) {
      logger.error(
        $t("TXT_CODE_SUBSCRIPTION_ORDER_CREATE_FAILED", {
          uuid: subscription.uuid,
          err: String((err as any)?.message || err)
        })
      );
    }
    logger.warn(
      $t("TXT_CODE_SUBSCRIPTION_BALANCE_INSUFFICIENT", { uuid: subscription.uuid })
    );
    await this.notifyPaymentFailure(subscription);
  }

  /**
   * Scheduled balance retry. On the final failure the subscription becomes
   * PAST_DUE and the instance is stopped.
   */
  private async retryRenewal(subscription: Subscription, now: number) {
    if (await this.tryRenewByBalance(subscription, now)) return;

    if (subscription.failedPaymentCount >= MAX_RETRIES) {
      await this.stopInstance(subscription);
      subscription.status = SubscriptionStatus.PAST_DUE;
      subscription.graceExpireAt = now + DATA_RETENTION_MS;
      subscription.nextPaymentAt = 0;
      await this.save(subscription);
      logger.warn($t("TXT_CODE_SUBSCRIPTION_PAST_DUE", { uuid: subscription.uuid }));
      await this.notifyPaymentFailure(subscription);
      return;
    }

    subscription.failedPaymentCount += 1;
    const intervalDays =
      RETRY_INTERVAL_DAYS[Math.min(subscription.failedPaymentCount - 1, RETRY_INTERVAL_DAYS.length - 1)] ??
      RETRY_INTERVAL_DAYS[RETRY_INTERVAL_DAYS.length - 1];
    subscription.nextPaymentAt = now + intervalDays * DAY_MS;
    await this.save(subscription);
    logger.warn(
      $t("TXT_CODE_SUBSCRIPTION_RETRY", {
        n: subscription.failedPaymentCount,
        uuid: subscription.uuid,
        date: this.formatMs(subscription.nextPaymentAt)
      })
    );
  }

  /**
   * Delete the retained instance once the 3-day data-retention grace passes.
   */
  private async handleExpired(subscription: Subscription, now: number) {
    if (subscription.graceExpireAt <= 0 || now < subscription.graceExpireAt) return;
    await this.deleteInstance(subscription);
    subscription.graceExpireAt = 0;
    await this.save(subscription);
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_TERMINATED", { uuid: subscription.uuid })
    );
  }

  /**
   * A PAST_DUE subscription may still be renewed (via balance / order); only
   * the data-retention deadline is enforced here.
   */
  private async handlePastDue(subscription: Subscription, now: number) {
    if (subscription.graceExpireAt <= 0 || now < subscription.graceExpireAt) return;
    await this.deleteInstance(subscription);
    subscription.graceExpireAt = 0;
    subscription.status = SubscriptionStatus.EXPIRED;
    await this.save(subscription);
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_TERMINATED", { uuid: subscription.uuid })
    );
  }

  /**
   * Try to renew via the user balance. Returns true when the renewal was
   * completed (period extended, instance resumed).
   */
  private async tryRenewByBalance(subscription: Subscription, now: number): Promise<boolean> {
    const plan = this.getPlan(subscription);
    if (!plan) return false;
    const price = Number(plan.price) || 0;
    const user = userSystem.getInstance(subscription.userUuid);
    if (!user || Number(user.balance) < price) return false;
    try {
      await this.renewByBalance(subscription);
      return true;
    } catch (err) {
      logger.error(
        $t("TXT_CODE_SUBSCRIPTION_RENEW_FAILED", {
          uuid: subscription.uuid,
          err: String((err as any)?.message || err)
        })
      );
      return false;
    }
  }

  // ----------------------------------------------------------------
  // Daemon interactions
  // ----------------------------------------------------------------

  private async stopInstance(subscription: Subscription) {
    if (!subscription.instanceUuid) return;
    const daemon = RemoteServiceSubsystem.getInstance(subscription.daemonId);
    if (!daemon || !daemon.available) return;
    try {
      if ((await this.instanceStatus(subscription)) !== INSTANCE_STATUS_STOP) {
        await new RemoteRequest(daemon).request("instance/stop", {
          instanceUuids: [subscription.instanceUuid]
        });
      }
    } catch (err) {
      logger.warn(
        $t("TXT_CODE_SUBSCRIPTION_STOP_FAILED", {
          uuid: subscription.instanceUuid,
          err: String((err as any)?.message || err)
        })
      );
    }
  }

  private async resumeInstance(subscription: Subscription) {
    if (!subscription.instanceUuid) return;
    const daemon = RemoteServiceSubsystem.getInstance(subscription.daemonId);
    if (!daemon || !daemon.available) return;
    try {
      if ((await this.instanceStatus(subscription)) === INSTANCE_STATUS_STOP) {
        await new RemoteRequest(daemon).request("instance/open", {
          instanceUuids: [subscription.instanceUuid]
        });
      }
    } catch (err) {
      logger.warn(
        $t("TXT_CODE_SUBSCRIPTION_START_FAILED", {
          uuid: subscription.instanceUuid,
          err: String((err as any)?.message || err)
        })
      );
    }
  }

  private async applyInstanceEndTime(subscription: Subscription, endTimeMs: number) {
    if (!subscription.instanceUuid || !endTimeMs) return;
    const daemon = RemoteServiceSubsystem.getInstance(subscription.daemonId);
    if (!daemon || !daemon.available) return;
    try {
      await new RemoteRequest(daemon).request("instance/update", {
        instanceUuid: subscription.instanceUuid,
        config: { endTime: endTimeMs }
      });
    } catch (err) {
      logger.warn(
        $t("TXT_CODE_SUBSCRIPTION_ENDTIME_FAILED", {
          uuid: subscription.instanceUuid,
          err: String((err as any)?.message || err)
        })
      );
    }
  }

  private async deleteInstance(subscription: Subscription) {
    if (!subscription.instanceUuid) return;
    const daemon = RemoteServiceSubsystem.getInstance(subscription.daemonId);
    if (daemon && daemon.available) {
      try {
        await new RemoteRequest(daemon).request("instance/delete", {
          instanceUuids: [subscription.instanceUuid],
          deleteFile: true
        });
      } catch (err) {
        logger.warn(
          $t("TXT_CODE_SUBSCRIPTION_DELETE_FAILED", {
            uuid: subscription.instanceUuid,
            err: String((err as any)?.message || err)
          })
        );
      }
    }
    userSystem.deleteUserInstances(subscription.userUuid, [
      { instanceUuid: subscription.instanceUuid, daemonId: subscription.daemonId }
    ]);
    logger.info(
      $t("TXT_CODE_SUBSCRIPTION_INSTANCE_DELETED", { uuid: subscription.instanceUuid })
    );
  }

  private async instanceStatus(subscription: Subscription): Promise<number> {
    const daemon = RemoteServiceSubsystem.getInstance(subscription.daemonId);
    if (!daemon || !daemon.available) return INSTANCE_STATUS_BUSY;
    const detail = await new RemoteRequest(daemon).request("instance/detail", {
      instanceUuid: subscription.instanceUuid
    });
    return Number(detail?.status ?? INSTANCE_STATUS_BUSY);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private async notifyPaymentFailure(subscription: Subscription) {
    const user = userSystem.getInstance(subscription.userUuid);
    if (!user?.email) return;
    const plan = this.getPlan(subscription);
    await sendPaymentFailureEmail(user, subscription, plan);
  }

  private async cancelPendingRenewOrders(subscription: Subscription, exceptUuid = "") {
    for (const order of orderSystem.objects.values()) {
      if (
        order.type === OrderType.RENEW &&
        order.status === OrderStatus.PENDING &&
        order.userUuid === subscription.userUuid &&
        order.planUuid === subscription.planUuid &&
        order.instanceUuid === subscription.instanceUuid &&
        order.uuid !== exceptUuid
      ) {
        order.status = OrderStatus.CANCELLED;
        await orderSystem.save(order);
      }
    }
  }

  private async createRenewRecord(
    subscription: Subscription,
    plan: Plan,
    amount: number,
    payGateway: string
  ): Promise<Order> {
    const order = await orderSystem.create({
      userUuid: subscription.userUuid,
      planUuid: subscription.planUuid,
      type: OrderType.RENEW,
      amount,
      subject: `${plan.name} - ${$t("TXT_CODE_SUBSCRIPTION_RENEW_SUBJECT")}`,
      autoRenew: true
    });
    order.instanceUuid = subscription.instanceUuid;
    order.daemonId = subscription.daemonId;
    await orderSystem.completeRenew(order.uuid, this.formatMs(subscription.currentPeriodEnd), payGateway);
    return orderSystem.getByUuid(order.uuid) as Order;
  }

  private async deductBalance(userUuid: string, amount: number): Promise<boolean> {
    const user = userSystem.getInstance(userUuid);
    if (!user) return false;
    const balance = Number(user.balance) || 0;
    if (balance < amount) return false;
    await userSystem.edit(userUuid, { balance: balance - amount });
    return true;
  }

  private cycleMonths(plan: Plan): number {
    switch (Number(plan.billingCycle)) {
      case BillingCycle.MONTHLY:
        return 1;
      case BillingCycle.QUARTERLY:
        return 3;
      case BillingCycle.YEARLY:
        return 12;
      default:
        return 0;
    }
  }

  private extendPeriodMs(subscription: Subscription, months: number): number {
    if (months <= 0) return 0;
    const base = Math.max(subscription.currentPeriodEnd, Date.now());
    const date = new Date(base);
    date.setMonth(date.getMonth() + months);
    return date.getTime();
  }

  private formatMs(ms: number): string {
    return ms > 0 ? new Date(ms).toLocaleString() : "";
  }
}

export default new SubscriptionSubsystem();
