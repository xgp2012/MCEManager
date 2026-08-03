// Node heartbeat monitor.
//
// The daemon sockets already self-reconnect (see remote_service.ts); this
// service adds an operational layer on top of it:
//
//   - Tracks the last observed availability of every daemon node and records
//     every online/offline transition into a bounded JSONL log so operators
//     can audit connectivity over time.
//   - Sends an admin alert email (when configured) whenever a node changes
//     state, so operators are notified of outages without polling the panel.
//
// The heartbeat log is capped (JsonlStorageSubsystem) so it can never grow
// without bound.

import schedule from "node-schedule";
import { JsonlStorageSubsystem } from "./../common/storage/jsonl_storage";
import { $t } from "../i18n";
import { sendAdminAlertEmail } from "./email_service";
import { logger } from "./log";
import RemoteServiceSubsystem from "./remote_service";

export interface HeartbeatEvent {
  time: number;
  uuid: string;
  remarks: string;
  ip: string;
  port: number;
  available: boolean;
  event: "online" | "offline";
}

class HeartbeatSubsystem {
  // Bounded log of connectivity transitions (oldest entries are trimmed).
  #storage = new JsonlStorageSubsystem("/node_heartbeats", 2000);

  // Last observed availability per node uuid. `undefined` means the node has
  // not been observed yet (first tick) and must not trigger an alert.
  #previous = new Map<string, boolean>();

  // Last tick timestamp per node uuid (epoch ms).
  #lastSeen = new Map<string, number>();

  #started = false;

  startScheduler() {
    if (this.#started) return;
    this.#started = true;
    // Catch-up tick immediately so long-running outages noticed while the
    // panel was offline are recorded, then check once per minute.
    this.tick().catch((err) =>
      logger.error(
        $t("TXT_CODE_HEARTBEAT_TICK_FAILED", {
          err: String((err as any)?.message || err)
        })
      )
    );
    schedule.scheduleJob("*/1 * * * *", () => {
      this.tick().catch((err) =>
        logger.error(
          $t("TXT_CODE_HEARTBEAT_TICK_FAILED", {
            err: String((err as any)?.message || err)
          })
        )
      );
    });
  }

  async tick() {
    const now = Date.now();
    for (const service of RemoteServiceSubsystem.services.values()) {
      const current = service.available;
      const previous = this.#previous.get(service.uuid);

      this.#lastSeen.set(service.uuid, now);

      // First observation: seed the state without raising a false alert.
      if (previous === undefined) {
        this.#previous.set(service.uuid, current);
        continue;
      }

      if (previous === current) continue;

      this.#previous.set(service.uuid, current);
      const event: HeartbeatEvent = {
        time: now,
        uuid: service.uuid,
        remarks: service.config.remarks || service.uuid,
        ip: service.config.ip,
        port: service.config.port,
        available: current,
        event: current ? "online" : "offline"
      };
      try {
        await this.#storage.append("global", event);
      } catch (err) {
        logger.error(
          $t("TXT_CODE_HEARTBEAT_TICK_FAILED", {
            err: String((err as any)?.message || err)
          })
        );
      }

      if (!current) {
        logger.warn($t("TXT_CODE_HEARTBEAT_NODE_OFFLINE", { remarks: event.remarks }));
      } else {
        logger.info($t("TXT_CODE_HEARTBEAT_NODE_ONLINE", { remarks: event.remarks }));
      }
      await sendAdminAlertEmail(
        $t(event.available ? "TXT_CODE_HEARTBEAT_NODE_ONLINE" : "TXT_CODE_HEARTBEAT_NODE_OFFLINE", {
          remarks: event.remarks
        }),
        $t(
          event.available
            ? "TXT_CODE_HEARTBEAT_ONLINE_MSG"
            : "TXT_CODE_HEARTBEAT_OFFLINE_MSG",
          {
            remarks: event.remarks,
            ip: event.ip,
            port: event.port,
            time: new Date(event.time).toLocaleString()
          }
        )
      );
    }
  }

  async getHistory(limit = 100): Promise<HeartbeatEvent[]> {
    const count = Math.min(500, Math.max(1, limit));
    return this.#storage.tail<HeartbeatEvent>("global", count);
  }

  /**
   * Live availability + last-seen snapshot for every node.
   */
  getStatus() {
    const result: Array<{
      uuid: string;
      remarks: string;
      ip: string;
      port: number;
      available: boolean;
      lastSeen: number;
    }> = [];
    RemoteServiceSubsystem.services.forEach((service) => {
      result.push({
        uuid: service.uuid,
        remarks: service.config.remarks || service.uuid,
        ip: service.config.ip,
        port: service.config.port,
        available: service.available,
        lastSeen: this.#lastSeen.get(service.uuid) || 0
      });
    });
    return result;
  }
}

export default new HeartbeatSubsystem();
