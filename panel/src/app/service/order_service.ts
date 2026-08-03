import { LocalFileSource, QueryWrapper } from "mcsmanager-common";
import { v4 } from "uuid";
import Storage from "../common/storage/sys_storage";
import { Order, OrderStatus, OrderType } from "../entity/order";
import { $t } from "../i18n";
import { logger } from "./log";
import userSystem from "./user_service";

export interface OrderCreateData {
  userUuid: string;
  planUuid: string;
  type?: number;
  amount: number;
  currency?: string;
  subject?: string;
  autoRenew?: boolean;
}

export interface PayConfirmation {
  gateway?: string;
  gatewayOrderNo?: string;
  amount?: number;
  rawData?: any;
}

class OrderSubsystem {
  public readonly objects: Map<string, Order> = new Map();

  async initialize() {
    for (const uuid of await Storage.getStorage().list("Order")) {
      const order = (await Storage.getStorage().load("Order", Order, uuid)) as Order;
      this.objects.set(uuid, order);
    }
    logger.info($t("TXT_CODE_ORDER_LOADED", { n: this.objects.size }));
  }

  async create(data: OrderCreateData): Promise<Order> {
    const uuid = v4().replace(/-/gim, "");
    const now = new Date().toLocaleString();
    const order = new Order();
    order.uuid = uuid;
    order.userUuid = data.userUuid;
    order.planUuid = data.planUuid;
    order.type = Number(data.type ?? 1);
    order.status = OrderStatus.PENDING;
    order.amount = Number(data.amount);
    order.currency = String(data.currency || "CNY");
    order.subject = String(data.subject || "");
    order.autoRenew = Boolean(data.autoRenew);
    order.createdAt = now;
    order.updatedAt = now;
    this.objects.set(uuid, order);
    await Storage.getStorage().store("Order", uuid, order);
    return order;
  }

  async save(order: Order) {
    order.updatedAt = new Date().toLocaleString();
    await Storage.getStorage().store("Order", order.uuid, order);
  }

  getByUuid(uuid: string) {
    return this.objects.get(uuid) || null;
  }

  getByOrderNo(orderNo: string) {
    for (const order of this.objects.values()) {
      if (order.uuid === orderNo) return order;
    }
    return null;
  }

  /**
   * Find a pending renewal order for a subscription (user + plan + instance).
   */
  findPendingRenew(userUuid: string, planUuid: string, instanceUuid: string): Order | null {
    for (const order of this.objects.values()) {
      if (
        order.type === OrderType.RENEW &&
        order.status === OrderStatus.PENDING &&
        order.userUuid === userUuid &&
        order.planUuid === planUuid &&
        order.instanceUuid === instanceUuid
      )
        return order;
    }
    return null;
  }

  /**
   * Finalize a renewal order (PENDING / PAID -> COMPLETED). Used both when the
   * order is paid through the payment gateway and when it is covered directly
   * by the user balance.
   */
  async completeRenew(uuid: string, expireAt: string, payGateway = ""): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order || order.type !== OrderType.RENEW) return false;
    if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) return false;
    const now = new Date().toLocaleString();
    order.status = OrderStatus.COMPLETED;
    order.payTime = now;
    order.completedAt = now;
    order.expireAt = String(expireAt || "");
    order.remark = "";
    if (payGateway) order.payGateway = String(payGateway);
    await this.save(order);
    return true;
  }

  /**
   * Mark a renewal order as failed (e.g. its subscription no longer exists).
   */
  async failRenew(uuid: string, reason: string): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order || order.type !== OrderType.RENEW) return false;
    if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) return false;
    order.status = OrderStatus.FAILED;
    order.remark = String(reason || "").slice(0, 500);
    await this.save(order);
    return true;
  }

  listByUser(userUuid: string, page = 1, pageSize = 10) {
    const result: Order[] = [];
    this.objects.forEach((order) => {
      if (order.userUuid === userUuid) result.push(order);
    });
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.paginate(result, page, pageSize);
  }

  listAll(page = 1, pageSize = 10) {
    const result: Order[] = Array.from(this.objects.values());
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.paginate(result, page, pageSize);
  }

  /**
   * Admin order list with optional status / type / keyword filters.
   * `keyword` matches the order uuid or the owning user name.
   */
  listAllFiltered(
    page = 1,
    pageSize = 10,
    filters: { status?: number; type?: number; keyword?: string } = {}
  ) {
    const { status, type, keyword } = filters;
    const result: Order[] = [];
    this.objects.forEach((order) => {
      if (status != null && order.status !== Number(status)) return;
      if (type != null && order.type !== Number(type)) return;
      if (keyword) {
        const user = userSystem.getInstance(order.userUuid);
        const userName = user?.userName || "";
        if (!order.uuid.includes(keyword) && !userName.includes(keyword)) return;
      }
      result.push(order);
    });
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.paginate(result, page, pageSize);
  }

  /**
   * Admin action: mark an order as refunded (manual refund flow).
   */
  async markRefunded(uuid: string, reason = ""): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    if (![OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.PROVISIONING, OrderStatus.COMPLETED].includes(order.status))
      throw new Error($t("TXT_CODE_ORDER_NOT_REFUNDABLE"));
    order.status = OrderStatus.REFUNDED;
    order.remark = String(reason || "").slice(0, 500);
    order.completedAt = new Date().toLocaleString();
    await this.save(order);
    return true;
  }

  /**
   * Admin action: reset a FAILED purchase order back to PAID so the
   * provisioning flow can be retried.
   */
  async retryProvision(uuid: string): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    if (order.type !== OrderType.PURCHASE)
      throw new Error($t("TXT_CODE_ADMIN_ORDER_RETRY_UNSUPPORTED"));
    if (order.status !== OrderStatus.FAILED)
      throw new Error($t("TXT_CODE_ADMIN_ORDER_RETRY_INVALID"));
    order.status = OrderStatus.PAID;
    order.remark = "";
    await this.save(order);
    return true;
  }

  /**
   * Admin action: manually mark a pending order as paid (人工核对后).
   * The order returns to the PAID state so the provisioning flow can proceed.
   */
  async markPaid(uuid: string): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    if (order.status !== OrderStatus.PENDING)
      throw new Error($t("TXT_CODE_ORDER_NOT_MARKABLE"));
    order.status = OrderStatus.PAID;
    order.payGateway = order.payGateway || "manual";
    order.payOrderNo = order.payOrderNo || `manual-${Date.now()}`;
    order.payTime = new Date().toLocaleString();
    await this.save(order);
    return true;
  }

  private paginate(data: Order[], page: number, pageSize: number) {
    page = Math.max(1, page || 1);
    pageSize = Math.min(50, Math.max(1, pageSize || 10));
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    let maxPage = 0;
    let size = data.length;
    while (size > 0) {
      size -= pageSize;
      maxPage++;
    }
    return {
      page,
      pageSize,
      maxPage,
      total: data.length,
      data: data.slice(start, end)
    };
  }

  getQueryWrapper() {
    return new QueryWrapper(new LocalFileSource<Order>(this.objects));
  }

  /**
   * Mark an order as paid after gateway callback verification.
   *
   * Idempotency protection:
   *   - The in-memory status check runs synchronously before any await, so two
   *     concurrent callbacks for the same order can never both pass the check
   *     (the first one flips the status before yielding to the event loop).
   *   - Orders that are already PAID / PROVISIONING / COMPLETED are treated as
   *     handled and return true without touching the state machine again.
   *   - The raw callback payload is stored on every first-time processing.
   *
   * @returns true when the payment is accepted, false when it must be rejected
   *          (amount mismatch or order in a terminal state).
   */
  async handlePaymentSuccess(order: Order, confirm: PayConfirmation): Promise<boolean> {
    if (!order) return false;

    // Already processed (either the same callback retried, or another callback).
    if (order.payTime) return true;
    if (order.status !== OrderStatus.PENDING) {
      const terminalHandled = [
        OrderStatus.PAID,
        OrderStatus.PROVISIONING,
        OrderStatus.COMPLETED,
        OrderStatus.REFUNDED
      ];
      return terminalHandled.includes(order.status);
    }

    // Validate the paid amount against the expected order amount.
    if (confirm.amount != null && confirm.amount !== order.amount) {
      order.payRawData = JSON.stringify(confirm.rawData || {});
      order.status = OrderStatus.FAILED;
      await this.save(order);
      logger.error(
        $t("TXT_CODE_ORDER_AMOUNT_MISMATCH", {
          uuid: order.uuid,
          expect: order.amount,
          actual: confirm.amount
        })
      );
      return false;
    }

    order.status = OrderStatus.PAID;
    order.payGateway = String(confirm.gateway || "");
    order.payOrderNo = String(confirm.gatewayOrderNo || "");
    order.payTime = new Date().toLocaleString();
    order.payRawData = JSON.stringify(confirm.rawData || {});
    await this.save(order);
    logger.info($t("TXT_CODE_ORDER_PAID", { uuid: order.uuid, amount: order.amount }));
    return true;
  }

  /**
   * Cancel a pending order (user initiated).
   */
  async cancelOrder(uuid: string): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order) throw new Error($t("TXT_CODE_ORDER_NOT_FOUND"));
    if (order.status !== OrderStatus.PENDING)
      throw new Error($t("TXT_CODE_ORDER_NOT_CANCELLABLE"));
    order.status = OrderStatus.CANCELLED;
    await this.save(order);
    return true;
  }

  /**
   * Transition a paid order into the provisioning state (PAID -> PROVISIONING).
   * Idempotent: an order that is already PROVISIONING / COMPLETED / FAILED is
   * left untouched.
   */
  async markProvisioning(uuid: string): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order) return false;
    if (order.status !== OrderStatus.PAID) return false;
    order.status = OrderStatus.PROVISIONING;
    await this.save(order);
    return true;
  }

  /**
   * Finalize a successfully provisioned order (PROVISIONING -> COMPLETED).
   */
  async completeProvision(
    uuid: string,
    instanceUuid: string,
    daemonId: string,
    expireAt: string
  ): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order || order.status !== OrderStatus.PROVISIONING) return false;
    order.status = OrderStatus.COMPLETED;
    order.instanceUuid = String(instanceUuid);
    order.daemonId = String(daemonId);
    order.expireAt = String(expireAt);
    order.completedAt = new Date().toLocaleString();
    order.remark = "";
    await this.save(order);
    return true;
  }

  /**
   * Mark a provisioning run as failed (PROVISIONING -> FAILED) and record the
   * reason for the admin / user to inspect.
   */
  async failProvision(uuid: string, error: Error | string): Promise<boolean> {
    const order = this.getByUuid(uuid);
    if (!order || order.status !== OrderStatus.PROVISIONING) return false;
    const message = typeof error === "string" ? error : error?.message;
    order.status = OrderStatus.FAILED;
    order.remark = String(message || "").slice(0, 500);
    await this.save(order);
    return true;
  }
}

export default new OrderSubsystem();
