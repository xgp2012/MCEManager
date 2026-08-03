import Koa from "koa";
import Router from "@koa/router";
import { OrderStatus } from "../entity/order";
import { SubscriptionStatus } from "../entity/subscription";
import { UserStatus } from "../entity/user";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import { logger } from "../service/log";
import orderSystem from "../service/order_service";
import RemoteRequest from "../service/remote_command";
import RemoteServiceSubsystem from "../service/remote_service";
import statsSystem from "../service/stats_service";
import subscriptionSystem from "../service/subscription_service";
import userSystem from "../service/user_service";

const router = new Router({ prefix: "/dashboard" });

// Instance status values reported by the daemon.
const INSTANCE_STATUS_RUNNING = 3;
const INSTANCE_STATUS_STOP = 0;

// Parse a `toLocaleString()` timestamp into epoch ms. `new Date(str)` is
// reliable for the numeric / US formats produced by the panel, and a regex
// fallback covers the common YMD / DMY variants.
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

function buildDateRange(days: number): string[] {
  const range: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    range.push(`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`);
  }
  return range;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// [Admin Permission]
// Overview statistics for the dashboard.
router.get("/stats", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const now = Date.now();
  const nowDay = startOfDay(now);

  // ---- Users ----
  let totalUsers = 0;
  let activeUsers = 0;
  let pendingVerifyUsers = 0;
  let suspendedUsers = 0;
  let newToday = 0;
  let newThisMonth = 0;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  userSystem.objects.forEach((user) => {
    totalUsers++;
    const status = Number(user.status);
    if (status === UserStatus.ACTIVE) activeUsers++;
    if (status === UserStatus.PENDING_VERIFY) pendingVerifyUsers++;
    if (status === UserStatus.SUSPENDED) suspendedUsers++;
    const reg = parseLocaleTime(user.registerTime);
    if (reg >= nowDay) newToday++;
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
      if (pay >= nowDay) revenueToday += Number(order.amount) || 0;
      if (pay >= monthStart.getTime()) revenueThisMonth += Number(order.amount) || 0;
    }
  });

  // ---- Subscriptions ----
  let subActive = 0;
  let subPastDue = 0;
  let subCancelled = 0;
  let subExpiringSoon = 0;
  const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;
  subscriptionSystem.objects.forEach((sub) => {
    if (sub.status === SubscriptionStatus.ACTIVE) subActive++;
    if (sub.status === SubscriptionStatus.PAST_DUE) subPastDue++;
    if (sub.status === SubscriptionStatus.CANCELLED) subCancelled++;
    if (
      sub.status === SubscriptionStatus.ACTIVE &&
      sub.currentPeriodEnd > 0 &&
      sub.currentPeriodEnd - now <= EXPIRING_SOON_MS &&
      sub.currentPeriodEnd >= now
    ) {
      subExpiringSoon++;
    }
  });

  // ---- Nodes & instances (queried from daemons in parallel) ----
  let nodeTotal = RemoteServiceSubsystem.services.size;
  let nodeOnline = 0;
  let nodeOffline = 0;
  let totalCpu = 0;
  let usedCpu = 0;
  let totalMemory = 0;
  let usedMemory = 0;
  let totalDisk = 0;
  let usedDisk = 0;
  let instanceRunning = 0;
  let instanceStopped = 0;
  let instanceTotal = 0;

  const nodePromises = Array.from(RemoteServiceSubsystem.services.values()).map(
    async (remoteService) => {
      if (!remoteService.available) {
        nodeOffline++;
        return;
      }
      nodeOnline++;
      try {
        const info = await new RemoteRequest(remoteService).request("info/overview");
        const sys = info?.system || {};
        const cpu = Number(sys.cpu || 0);
        const memTotal = Number(sys.memTotal || 0);
        const memFree = Number(sys.memFree || 0);
        const diskTotal = Number(sys.diskTotal || 0);
        const diskFree = Number(sys.diskFree || 0);
        totalCpu += cpu;
        usedCpu += cpu;
        totalMemory += memTotal;
        usedMemory += memTotal - memFree;
        totalDisk += diskTotal;
        usedDisk += diskTotal - diskFree;
      } catch (err) {
        logger.warn(
          $t("TXT_CODE_ADMIN_NODE_INFO_FAILED", {
            id: remoteService.uuid,
            err: String((err as any)?.message || err)
          })
        );
      }
      try {
        const instances = (await new RemoteRequest(remoteService).request("instance/overview")) as any[];
        if (Array.isArray(instances)) {
          instanceTotal += instances.length;
          for (const instance of instances) {
            const status = Number(instance?.status);
            if (status === INSTANCE_STATUS_RUNNING) instanceRunning++;
            else if (status === INSTANCE_STATUS_STOP) instanceStopped++;
          }
        }
      } catch (err) {
        logger.warn(
          $t("TXT_CODE_ADMIN_INSTANCE_LIST_FAILED", {
            id: remoteService.uuid,
            err: String((err as any)?.message || err)
          })
        );
      }
    }
  );
  await Promise.all(nodePromises);

  ctx.body = {
    users: {
      total: totalUsers,
      active: activeUsers,
      pendingVerify: pendingVerifyUsers,
      suspended: suspendedUsers,
      newToday: newToday,
      newThisMonth: newThisMonth
    },
    instances: {
      total: instanceTotal,
      running: instanceRunning,
      stopped: instanceStopped,
      expired: orderTotal ? Math.max(0, instanceTotal - instanceRunning - instanceStopped) : 0
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
      expiringSoon: subExpiringSoon
    },
    nodes: {
      total: nodeTotal,
      online: nodeOnline,
      offline: nodeOffline,
      totalCpu,
      usedCpu,
      totalMemory,
      usedMemory,
      totalDisk,
      usedDisk
    }
  };
});

// [Admin Permission]
// Revenue trend grouped by day (paid orders only).
router.get("/revenue", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const days = Math.min(90, Math.max(1, Number(ctx.query.days) || 30));
  const map = new Map<string, number>();
  const range = buildDateRange(days);
  range.forEach((key) => map.set(key, 0));
  orderSystem.objects.forEach((order) => {
    if (![OrderStatus.PAID, OrderStatus.PROVISIONING, OrderStatus.COMPLETED].includes(order.status))
      return;
    if (!order.payTime) return;
    const key = dayKey(parseLocaleTime(order.payTime));
    if (map.has(key)) map.set(key, (map.get(key) || 0) + (Number(order.amount) || 0));
  });
  ctx.body = range.map((key) => ({ date: key, amount: map.get(key) || 0 }));
});

// [Admin Permission]
// Registration trend grouped by day.
router.get(
  "/registrations",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const days = Math.min(90, Math.max(1, Number(ctx.query.days) || 30));
    const map = new Map<string, number>();
    const range = buildDateRange(days);
    range.forEach((key) => map.set(key, 0));
    userSystem.objects.forEach((user) => {
      const key = dayKey(parseLocaleTime(user.registerTime));
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });
    ctx.body = range.map((key) => ({ date: key, count: map.get(key) || 0 }));
  }
);

// [Admin Permission]
// Aggregated daily business statistics (persisted snapshots). The current day
// is computed live so the dashboard always has data, even on first run.
router.get(
  "/stats-history",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const days = Math.min(365, Math.max(1, Number(ctx.query.days) || 30));
    const history = await statsSystem.getHistory(days);
    const today = statsSystem.computeSnapshot();
    ctx.body = { list: history, today };
  }
);

export default router;
