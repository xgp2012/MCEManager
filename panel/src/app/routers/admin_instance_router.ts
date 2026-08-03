import Koa from "koa";
import Router from "@koa/router";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { operationLogger } from "../service/operation_logger";
import RemoteRequest from "../service/remote_command";
import RemoteServiceSubsystem from "../service/remote_service";
import userSystem from "../service/user_service";

const router = new Router({ prefix: "/instances" });

const MBPS_TO_KBS = 1000 / 8; // 1 Mbps = 125 KB/s

function requireDaemon(daemonId: string) {
  const daemon = RemoteServiceSubsystem.getInstance(daemonId);
  if (!daemon) throw new Error($t("TXT_CODE_ADMIN_DAEMON_NOT_FOUND"));
  return daemon;
}

// [Admin Permission]
// Cross-node instance list. Each daemon is queried (up to 50 entries) and the
// results are merged, sorted and paginated by the panel.
router.get(
  "/",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { page: Number, page_size: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query.page_size) || 10));
    const status = ctx.query.status != null ? Number(ctx.query.status) : NaN;
    const keyword = ctx.query.keyword ? String(ctx.query.keyword).trim() : "";
    const daemonId = ctx.query.daemonId ? String(ctx.query.daemonId) : "";

    const daemons = daemonId
      ? [RemoteServiceSubsystem.getInstance(daemonId)].filter(Boolean)
      : Array.from(RemoteServiceSubsystem.services.values());

    const all: any[] = [];
    await Promise.all(
      daemons.map(async (daemon) => {
        if (!daemon) return;
        if (!daemon.available) return;
        try {
          const result = await new RemoteRequest(daemon).request("instance/select", {
            page: 1,
            pageSize: 50,
            condition: {
              instanceName: keyword || undefined,
              status: isNaN(status) ? undefined : String(status)
            }
          });
          const list: any[] = Array.isArray(result?.data) ? result.data : [];
          list.forEach((item) => {
            all.push({
              ...item,
              daemonId: daemon.uuid,
              daemonRemarks: daemon.config.remarks,
              daemonIp: daemon.config.ip
            });
          });
        } catch (err) {
          // ignore per-daemon errors
        }
      })
    );

    if (!daemonId && keyword) {
      all.sort((a, b) =>
        String(a.nickname || "").localeCompare(String(b.nickname || ""))
      );
    }
    const total = all.length;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    ctx.body = {
      page,
      pageSize,
      maxPage,
      total,
      data: all.slice(start, start + pageSize)
    };
  }
);

// [Admin Permission]
// Instance detail (from the daemon).
router.get(
  "/:uuid",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { daemonId: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const instanceUuid = String(ctx.params.uuid);
    const daemon = requireDaemon(String(ctx.query.daemonId));
    const detail = await new RemoteRequest(daemon).request("instance/detail", {
      instanceUuid
    });
    ctx.body = { ...detail, daemonId: daemon.uuid, daemonRemarks: daemon.config.remarks };
  }
);

// [Admin Permission]
// Extend the instance expiry time (endTime in epoch ms).
router.post(
  "/:uuid/extend",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { daemonId: String }, body: { endTime: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const instanceUuid = String(ctx.params.uuid);
    const daemon = requireDaemon(String(ctx.query.daemonId));
    const endTime = Number(ctx.request.body.endTime);
    if (isNaN(endTime) || endTime <= 0) throw new Error($t("TXT_CODE_ADMIN_ENDTIME_INVALID"));
    await new RemoteRequest(daemon).request("instance/update", {
      instanceUuid,
      config: { endTime }
    });
    operationLogger.warning("instance_extend", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      daemon_id: daemon.uuid,
      instance_id: instanceUuid
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Suspend an instance (stop it).
router.post(
  "/:uuid/suspend",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { daemonId: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const instanceUuid = String(ctx.params.uuid);
    const daemon = requireDaemon(String(ctx.query.daemonId));
    await new RemoteRequest(daemon).request("instance/stop", {
      instanceUuids: [instanceUuid]
    });
    operationLogger.warning("instance_suspend", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      daemon_id: daemon.uuid,
      instance_id: instanceUuid
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Resume a suspended instance.
router.post(
  "/:uuid/resume",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { daemonId: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const instanceUuid = String(ctx.params.uuid);
    const daemon = requireDaemon(String(ctx.query.daemonId));
    await new RemoteRequest(daemon).request("instance/open", {
      instanceUuids: [instanceUuid]
    });
    operationLogger.warning("instance_resume", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      daemon_id: daemon.uuid,
      instance_id: instanceUuid
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Delete an instance (with optional file deletion).
router.del(
  "/:uuid",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { daemonId: String } }),
  async (ctx: Koa.ParameterizedContext) => {
    const instanceUuid = String(ctx.params.uuid);
    const daemon = requireDaemon(String(ctx.query.daemonId));
    const deleteFile = Boolean(ctx.request.body.deleteFile);
    userSystem.deleteUserInstances(null, [{ instanceUuid, daemonId: daemon.uuid }], true);
    const result = await new RemoteRequest(daemon).request("instance/delete", {
      instanceUuids: [instanceUuid],
      deleteFile
    });
    operationLogger.warning("instance_delete", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      daemon_id: daemon.uuid,
      instance_id: instanceUuid
    });
    ctx.body = result;
  }
);

// [Admin Permission]
// Adjust an instance's bandwidth limits (Mbps -> daemon KB/s).
router.put(
  "/:uuid/bandwidth",
  permission({ level: ROLE.ADMIN }),
  validator({ query: { daemonId: String }, body: { uploadLimit: Number, downloadLimit: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const instanceUuid = String(ctx.params.uuid);
    const daemon = requireDaemon(String(ctx.query.daemonId));
    const upload = Number(ctx.request.body.uploadLimit);
    const download = Number(ctx.request.body.downloadLimit);
    if (isNaN(upload) || isNaN(download) || upload < 0 || download < 0)
      throw new Error($t("TXT_CODE_ADMIN_BANDWIDTH_INVALID"));

    await new RemoteRequest(daemon).request("instance/update", {
      instanceUuid,
      config: {
        docker: {
          uploadSpeedLimit: upload > 0 ? Math.round(upload * MBPS_TO_KBS) : 0,
          downloadSpeedLimit: download > 0 ? Math.round(download * MBPS_TO_KBS) : 0
        }
      }
    });
    operationLogger.warning("instance_bandwidth_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      daemon_id: daemon.uuid,
      instance_id: instanceUuid
    });
    ctx.body = true;
  }
);

export default router;
