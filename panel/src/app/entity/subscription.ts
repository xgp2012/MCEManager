// Subscription entity definition.
// A subscription is created when a recurring-billing plan (MONTHLY / QUARTERLY /
// YEARLY) is purchased. It tracks the current billing period, the auto-renew
// flag and the renewal/expiry state machine:
//
//   ACTIVE   -> normal, inside the current billing period
//   CANCELLED -> user cancelled auto-renew, waiting for the period to end
//   PAST_DUE -> auto-renewal failed after 3 retries, instance stopped
//   EXPIRED  -> period ended without renewal; instance stopped and its data is
//               retained for a short grace period before being deleted
//
// Timestamps of the billing lifecycle (currentPeriodStart/End, lastPaymentAt,
// nextPaymentAt, graceExpireAt) are stored as epoch milliseconds (numbers) so
// the scheduler can compare them reliably.

export enum SubscriptionStatus {
  ACTIVE = 1, // normal
  PAST_DUE = 2, // billing overdue
  CANCELLED = 3, // cancelled (waiting for the period to end)
  EXPIRED = 4 // expired / stopped
}

export interface ISubscription {
  uuid: string;
  userUuid: string;
  planUuid: string;
  instanceUuid: string;
  daemonId: string;
  status: SubscriptionStatus;
  currentPeriodStart: number; // epoch ms
  currentPeriodEnd: number; // epoch ms
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  lastPaymentAt: number; // epoch ms
  nextPaymentAt: number; // epoch ms (next auto-renewal attempt)
  failedPaymentCount: number; // consecutive balance deduction failures
  graceExpireAt: number; // epoch ms; when the retained data is deleted
  reminderSentAt: number; // epoch ms; when the expiry reminder was last sent
  createdAt: string;
  updatedAt: string;
}

export class Subscription implements ISubscription {
  uuid = "";
  userUuid = "";
  planUuid = "";
  instanceUuid = "";
  daemonId = "";
  status: number = SubscriptionStatus.ACTIVE;
  currentPeriodStart = 0;
  currentPeriodEnd = 0;
  autoRenew = false;
  cancelAtPeriodEnd = false;
  lastPaymentAt = 0;
  nextPaymentAt = 0;
  failedPaymentCount = 0;
  graceExpireAt = 0;
  reminderSentAt = 0;
  createdAt = "";
  updatedAt = "";
}
