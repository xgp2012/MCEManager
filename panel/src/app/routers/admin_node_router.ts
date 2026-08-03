import Koa from "koa";
import Router from "@koa/router";
import { ROLE } from "../entity/user";
import { $t } from "../i18n";
import permission from "../middleware/permission";
import validator from "../middleware/validator";
import { operationLogger } from "../service/operation_logger";
import RemoteRequest from "../service/remote_command";
import RemoteServiceSubsystem from "../service/remote_service";
import heartbeatSystem from "../service/heartbeat_service";

const router = new Router({ prefix: "/nodes" });

// [Admin Permission]
// Node list enriched with system info and instance count.
router.get("/", permission({ level: ROLE.ADMIN }), async (ctx: Koa.ParameterizedContext) => {
  const result: any[] = [];
  const heartbeatStatus = new Map(
    heartbeatSystem.getStatus().map((item) => [item.uuid, item])
  );
  await Promise.all(
    Array.from(RemoteServiceSubsystem.services.values()).map(async (daemon) => {
      const base = {
        uuid: daemon.uuid,
        ip: daemon.config.ip,
        port: daemon.config.port,
        prefix: daemon.config.prefix,
        remarks: daemon.config.remarks,
        available: daemon.available,
        lastSeen: heartbeatStatus.get(daemon.uuid)?.lastSeen || 0
      };
      let info: any = null;
      let instanceCount = 0;
      if (daemon.available) {
        try {
          info = await new RemoteRequest(daemon).request("info/overview");
        } catch (err) {
          // ignore
        }
        try {
          const instances = (await new RemoteRequest(daemon).request("instance/overview")) as any[];
          instanceCount = Array.isArray(instances) ? instances.length : 0;
        } catch (err) {
          // ignore
        }
      }
      result.push({ ...base, info, instanceCount });
    })
  );
  ctx.body = result;
});

// [Admin Permission]
// Node connectivity history (online / offline transition log).
router.get(
  "/heartbeats",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const limit = Math.min(500, Math.max(1, Number(ctx.query.limit) || 100));
    ctx.body = {
      list: await heartbeatSystem.getHistory(limit),
      status: heartbeatSystem.getStatus()
    };
  }
);

// [Admin Permission]
// Edit a node's configuration.
router.put(
  "/:uuid",
  permission({ level: ROLE.ADMIN }),
  validator({ body: { ip: String, port: Number } }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const daemon = RemoteServiceSubsystem.getInstance(uuid);
    if (!daemon) throw new Error($t("TXT_CODE_ADMIN_DAEMON_NOT_FOUND"));
    const body = ctx.request.body;
    await RemoteServiceSubsystem.edit(uuid, {
      ip: body.ip ? String(body.ip) : daemon.config.ip,
      port: body.port ? Number(body.port) : daemon.config.port,
      remarks: body.remarks != null ? String(body.remarks) : daemon.config.remarks,
      apiKey: body.apiKey ? String(body.apiKey) : daemon.config.apiKey,
      prefix: body.prefix != null ? String(body.prefix) : daemon.config.prefix
    });
    operationLogger.warning("daemon_config_change", {
      operator_ip: ctx.ip,
      operator_name: ctx.session?.["userName"],
      daemon_id: uuid
    });
    ctx.body = true;
  }
);

// [Admin Permission]
// Manually sync a node: reconnect and refresh the instance list.
router.post(
  "/:uuid/sync",
  permission({ level: ROLE.ADMIN }),
  async (ctx: Koa.ParameterizedContext) => {
    const uuid = String(ctx.params.uuid);
    const daemon = RemoteServiceSubsystem.getInstance(uuid);
    if (!daemon) throw new Error($t("TXT_CODE_ADMIN_DAEMON_NOT_FOUND"));
    try {
      daemon.connect();
    } catch (err) {
      // reconnection is asynchronous; ignore
    }
    let instanceCount = 0;
    if (daemon.available) {
      try {
        const instances = (await new RemoteRequest(daemon).request("instance/overview")) as any[];
        instanceCount = Array.isArray(instances) ? instances.length : 0;
      } catch (err) {
        // ignore
      }
    }
    ctx.body = { available: daemon.available, instanceCount };
  }
);

export default router;
