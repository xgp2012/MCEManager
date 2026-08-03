// Order entity definition.
// An order represents a purchase / renewal / upgrade transaction. It follows
// a state machine: PENDING -> PAID -> PROVISIONING -> COMPLETED / FAILED.

export enum OrderType {
  PURCHASE = 1, // new purchase
  RENEW = 2, // renewal
  UPGRADE = 3 // upgrade resources
}

export enum OrderStatus {
  PENDING = 0, // waiting for payment
  PAID = 1, // paid, waiting for provisioning
  PROVISIONING = 2, // provisioning in progress
  COMPLETED = 3, // completed (instance created)
  FAILED = 4, // provisioning failed
  REFUNDED = 5, // refunded
  CANCELLED = 6 // cancelled (timeout / user)
}

export interface IOrder {
  uuid: string;
  userUuid: string;
  planUuid: string;
  type: OrderType;
  status: OrderStatus;
  amount: number; // paid amount in cents
  currency: string;
  subject: string; // goods title snapshot (used for payment)
  // payment information
  payGateway: string;
  payOrderNo?: string; // gateway order number
  payTime?: string;
  payRawData?: string; // raw callback data (JSON)
  // business information
  instanceUuid?: string;
  daemonId?: string;
  expireAt?: string; // expiry time (subscription)
  autoRenew: boolean;
  remark: string; // provisioning failure reason / note
  // metadata
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export class Order implements IOrder {
  uuid = "";
  userUuid = "";
  planUuid = "";
  type: number = OrderType.PURCHASE;
  status: number = OrderStatus.PENDING;
  amount = 0;
  currency = "CNY";
  subject = "";
  payGateway = "";
  payOrderNo = "";
  payTime = "";
  payRawData = "";
  instanceUuid = "";
  daemonId = "";
  expireAt = "";
  autoRenew = false;
  remark = "";
  createdAt = "";
  updatedAt = "";
  completedAt = "";
}
