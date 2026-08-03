// Daily business statistics aggregation.
//
// Every day (and once on startup for catch-up) the current business state is
// aggregated into a compact daily snapshot and persisted into a bounded JSONL
// store. This gives operators a historical record of user / order / revenue /
// subscription growth without having to recompute trends against the live
// daemons, and it doubles as an audit trail of the panel's business health.
//
// The snapshot store is capped (JsonlStorageSubsystem) so old days roll off
// automatically and it can never grow without bound.

import schedule from "node-schedule";
import { JsonlStorageSubsystem } from "./../common/storage/jsonl_storage";
import { OrderStatus } from "../entity/order";
import { SubscriptionStatus } from "../entity/subscription";
import { UserStatus } from "../entity/user";
import { $t } from "../i18n";
import { logger } from "./log";
import orderSystem from "./order_service";
import RemoteServiceSubsystem from "./remote_service";
import subscriptionSystem from "./subscription_service";
import userSystem from "./user_service";

export interface DailyStatSnapshot {
  date: string; // YYYY/MM/DD
  dayStart: number; // epoch ms
  users: {
    total: number;
    active: number;
    pendingVerify: number;
    suspended: number;
    newToday: number;
    newThisMonth: number;
  };
  orders: {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    revenueToday: number; // cents
    revenueThisMonth: number; // cents
    revenueTotal: number; // cents
  };
  subscriptions: {
    active: number;
    pastDue: number;
    cancelled: number;
    expired: number;
  };
  nodes: {
    total: number;
    online: number;
    offline: number;
  };
}

// `toLocaleString()` timestamps are parsed into epoch ms with a regex fallback
// for the common YMD / DMY variants (mirrors admin_dashboard_router).
function parseLocaleTime(value: string | number): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const str = String(value).trim();
  const direct = Date.parse(str);
  if (!isNaN(direct)) return direct;
  let m = str.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }
  m = str.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(
      Number(m[3]),
      Number(m[1]) - 1,
      Number(m[2]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0)
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

class StatsSubsystem {
  // One snapshot per day; ~2 years of history before old entries roll off.
  #storage = new JsonlStorageSubsystem("/stats_daily", 730);

  #started = false;

  startScheduler() {
    if (this.#started) return;
    this.#started = true;
    // Catch-up snapshot on startup so statistics persist even if the panel
    // restarts frequently, then aggregate once per day at 00:05.
    this.aggregateNow().catch((err) =>
      logger.error(
        $t("TXT_CODE_STATS_TICK_FAILED", {
          err: String((err as any)?.message || err)
        })
      )
    );
    schedule.scheduleJob("5 0 * * *", () => {
      this.aggregateNow().catch((err) =>
        logger.error(
          $t("TXT_CODE_STATS_TICK_FAILED", {
            err: String((err as any)?.message || err)
          })
        )
      );
    });
  }

  /**
   * Compute and persist today's snapshot. Idempotent: re-running on the same
   * day overwrites that day's entry.
   */
  async aggregateNow(): Promise<DailyStatSnapshot> {
    const snapshot = this.computeSnapshot();
    const existing = await this.#storage.query("global", (e) => e.date === snapshot.date);
    if (existing.length > 0) {
      await this.#storage.update("global", (e) => e.date === snapshot.date, () => snapshot);
    } else {
      await this.#storage.append("global", snapshot);
    }
    return snapshot;
  }

  /**
   * Compute the current business state without touching the store. Useful for
   * the dashboard so a snapshot is always available even before the first
   * scheduled aggregation.
   */
  computeSnapshot(): DailyStatSnapshot {
    const now = Date.now();
    const dayStart = startOfDay(now);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // ---- Users ----
    let totalUsers = 0;
    let activeUsers = 0;
    let pendingVerifyUsers = 0;
    let suspendedUsers = 0;
    let newToday = 0;
    let newThisMonth = 0;
    userSystem.objects.forEach((user) => {
      totalUsers++;
      const status = Number(user.status);
      if (status === UserStatus.ACTIVE) activeUsers++;
      if (status === UserStatus.PENDING_VERIFY) pendingVerifyUsers++;
      if (status === UserStatus.SUSPENDED) suspendedUsers++;
      const reg = parseLocaleTime(user.registerTime);
      if (reg >= dayStart) newToday++;
      if (reg >= monthStart.getTime()) newThisMonth++;
    });

    // ---- Orders / revenue ----
    let orderTotal = 0;
    let orderPending = 0;
    let orderCompleted = 0;
    let orderFailed = 0;
    let revenueToday = 0;
    let revenueThisMonth = 0;
    let revenueTotal = 0;
    orderSystem.objects.forEach((order) => {
      orderTotal++;
      if (order.status === OrderStatus.PENDING) orderPending++;
      if (order.status === OrderStatus.COMPLETED) orderCompleted++;
      if (order.status === OrderStatus.FAILED) orderFailed++;
      const isPaid = [OrderStatus.PAID, OrderStatus.PROVISIONING, OrderStatus.COMPLETED].includes(
        order.status
      );
      if (isPaid) {
        revenueTotal += Number(order.amount) || 0;
        const pay = parseLocaleTime(order.payTime);
        if (pay >= dayStart) revenueToday += Number(order.amount) || 0;
        if (pay >= monthStart.getTime()) revenueThisMonth += Number(order.amount) || 0;
      }
    });

    // ---- Subscriptions ----
    let subActive = 0;
    let subPastDue = 0;
    let subCancelled = 0;
    let subExpired = 0;
    subscriptionSystem.objects.forEach((sub) => {
      if (sub.status === SubscriptionStatus.ACTIVE) subActive++;
      if (sub.status === SubscriptionStatus.PAST_DUE) subPastDue++;
      if (sub.status === SubscriptionStatus.CANCELLED) subCancelled++;
      if (sub.status === SubscriptionStatus.EXPIRED) subExpired++;
    });

    // ---- Nodes ----
    let nodeTotal = RemoteServiceSubsystem.services.size;
    let nodeOnline = 0;
    RemoteServiceSubsystem.services.forEach((service) => {
      if (service.available) nodeOnline++;
    });

    return {
      date: dayKey(now),
      dayStart,
      users: {
        total: totalUsers,
        active: activeUsers,
        pendingVerify: pendingVerifyUsers,
        suspended: suspendedUsers,
        newToday,
        newThisMonth
      },
      orders: {
        total: orderTotal,
        pending: orderPending,
        completed: orderCompleted,
        failed: orderFailed,
        revenueToday,
        revenueThisMonth,
        revenueTotal
      },
      subscriptions: {
        active: subActive,
        pastDue: subPastDue,
        cancelled: subCancelled,
        expired: subExpired
      },
      nodes: {
        total: nodeTotal,
        online: nodeOnline,
        offline: nodeTotal - nodeOnline
      }
    };
  }

  /**
   * Historical daily snapshots, newest first.
   */
  async getHistory(limit = 30): Promise<DailyStatSnapshot[]> {
    const count = Math.min(365, Math.max(1, limit));
    const all = await this.#storage.tail<DailyStatSnapshot>("global", count);
    return all.reverse();
  }
}

export default new StatsSubsystem();
