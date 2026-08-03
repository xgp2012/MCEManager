// Plan (service plan / package) entity definition.
// A plan describes a purchasable service configuration (CPU, memory, disk,
// bandwidth and optional associated template) with a price and billing cycle.

export enum PlanType {
  INSTANCE = 1, // Predefined instance resources
  TEMPLATE = 2, // Template based (market mode, preinstalled environment)
  CUSTOM = 3 // Custom (reserved)
}

export enum BillingCycle {
  ONCE = 0, // One-time purchase
  MONTHLY = 1, // Monthly
  QUARTERLY = 3, // Quarterly
  YEARLY = 12 // Yearly
}

export interface IPlan {
  uuid: string;
  name: string;
  description: string;
  type: PlanType;
  price: number; // price in cents (fen)
  billingCycle: BillingCycle;
  // resource quotas (0 = unlimited)
  cpuLimit: number; // CPU cores
  memoryLimit: number; // memory in MB
  diskLimit: number; // disk in GB
  uploadLimit: number; // upload bandwidth in Mbps (0 = unlimited)
  downloadLimit: number; // download bandwidth in Mbps (0 = unlimited)
  // associated template (market mode)
  templateUuid?: string;
  daemonId?: string; // preferred daemon node (optional)
  // status
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export class Plan implements IPlan {
  uuid = "";
  name = "";
  description = "";
  type: number = PlanType.INSTANCE;
  price = 0;
  billingCycle: number = BillingCycle.ONCE;
  cpuLimit = 0;
  memoryLimit = 0;
  diskLimit = 0;
  uploadLimit = 0;
  downloadLimit = 0;
  templateUuid = "";
  daemonId = "";
  enabled = true;
  sortOrder = 0;
  createdAt = "";
  updatedAt = "";
}
