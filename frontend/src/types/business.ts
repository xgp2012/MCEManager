// Business domain types (plans, templates, orders) for Phase 2.

export enum PlanType {
  INSTANCE = 1,
  TEMPLATE = 2,
  CUSTOM = 3
}

export enum BillingCycle {
  ONCE = 0,
  MONTHLY = 1,
  QUARTERLY = 3,
  YEARLY = 12
}

export interface Plan {
  uuid: string;
  name: string;
  description: string;
  type: PlanType;
  price: number;
  billingCycle: BillingCycle;
  cpuLimit: number;
  memoryLimit: number;
  diskLimit: number;
  uploadLimit: number;
  downloadLimit: number;
  templateUuid: string;
  daemonId: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export enum TemplateCategory {
  MINECRAFT_JAVA = 1,
  MINECRAFT_BEDROCK = 2,
  STEAM_GAME = 3,
  VOICE_CHAT = 4,
  PROXY = 5,
  DATABASE = 6,
  WEB_SERVICE = 7,
  OTHER = 99
}

export enum TemplateType {
  DOCKER = 1,
  PROCESS = 2
}

export interface TemplatePort {
  containerPort: number;
  protocol: "tcp" | "udp";
  name: string;
  description?: string;
}

export interface TemplateVolume {
  containerPath: string;
  hostPath?: string;
  name?: string;
  readOnly: boolean;
}

export interface Template {
  uuid: string;
  name: string;
  displayName: string;
  description: string;
  category: TemplateCategory;
  type: TemplateType;
  dockerImage: string;
  dockerTag: string;
  processCommand: string;
  processArgs: string;
  processEnv: Record<string, string>;
  defaultCpuLimit: number;
  defaultMemoryLimit: number;
  defaultDiskLimit: number;
  defaultUploadLimit: number;
  defaultDownloadLimit: number;
  ports: TemplatePort[];
  volumes: TemplateVolume[];
  version: string;
  author: string;
  iconUrl: string;
  readme: string;
  enabled: boolean;
  isOfficial: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export enum OrderType {
  PURCHASE = 1,
  RENEW = 2,
  UPGRADE = 3
}

export enum OrderStatus {
  PENDING = 0,
  PAID = 1,
  PROVISIONING = 2,
  COMPLETED = 3,
  FAILED = 4,
  REFUNDED = 5,
  CANCELLED = 6
}

export interface Order {
  uuid: string;
  userUuid: string;
  planUuid: string;
  type: OrderType;
  status: OrderStatus;
  amount: number;
  currency: string;
  subject: string;
  payGateway: string;
  payOrderNo: string;
  payTime: string;
  payRawData: string;
  instanceUuid: string;
  daemonId: string;
  expireAt: string;
  autoRenew: boolean;
  remark: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}

export interface PageResult<T> {
  page: number;
  pageSize: number;
  maxPage: number;
  total: number;
  data: T[];
}

// --- Phase 4: subscriptions (auto-renew / billing periods) ---

export enum SubscriptionStatus {
  ACTIVE = 1,
  PAST_DUE = 2,
  CANCELLED = 3,
  EXPIRED = 4
}

export interface Subscription {
  uuid: string;
  userUuid: string;
  planUuid: string;
  instanceUuid: string;
  daemonId: string;
  status: SubscriptionStatus;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  lastPaymentAt: number;
  nextPaymentAt: number;
  failedPaymentCount: number;
  graceExpireAt: number;
  createdAt: string;
  updatedAt: string;
  // plan snapshot injected by the backend (withPlanInfo)
  planName: string;
  planPrice: number;
  planCycle: BillingCycle;
  planType: PlanType;
}

// A template as shown on the market, enriched with its purchasable plans.
export interface MarketTemplate extends Template {
  plans: Plan[];
}

export interface SubscriptionListResult {
  list: Subscription[];
  balance: number;
}

export interface RenewResult {
  order: Order;
  payUrl: string;
  gatewayOrderNo?: string;
  paidByBalance: boolean;
}

// --- Phase 5: admin panel (management backend) ---

export enum UserStatus {
  PENDING_VERIFY = 0,
  ACTIVE = 1,
  SUSPENDED = 2,
  EXPIRED = 3
}

export interface AdminUser {
  uuid: string;
  userName: string;
  permission: number;
  registerTime: string;
  loginTime: string;
  email: string;
  emailVerified: boolean;
  status: UserStatus;
  balance: number;
  apiKey: string;
  isInit: boolean;
  open2FA: boolean;
  ssoBound: boolean;
  ssoSub: string;
  instances: Array<{ instanceUuid: string; daemonId: string }>;
}

export interface AdminUserDetail extends AdminUser {
  orders: Array<{
    uuid: string;
    planUuid: string;
    type: OrderType;
    status: OrderStatus;
    amount: number;
    subject: string;
    instanceUuid: string;
    payTime: string;
    createdAt: string;
    completedAt: string;
    remark: string;
  }>;
  subscriptions: Subscription[];
  instances: any[];
}

// Order enriched with user / plan info by the admin API.
export interface AdminOrder extends Order {
  userName: string;
  userEmail: string;
  planName: string;
  payRawParsed?: any;
}

// Subscription enriched with user info by the admin API.
export interface AdminSubscription extends Subscription {
  userName: string;
  userEmail: string;
}

// Instance entry from a daemon `instance/select`, merged across nodes.
export interface AdminInstance {
  instanceUuid: string;
  daemonId: string;
  daemonRemarks: string;
  daemonIp: string;
  started: number;
  autoRestarted: number;
  status: number;
  config: {
    nickname: string;
    endTime?: number;
    tag?: string[];
    [key: string]: any;
  };
  info: any;
}

export interface AdminNode {
  uuid: string;
  ip: string;
  port: number;
  prefix: string;
  remarks: string;
  available: boolean;
  instanceCount: number;
  info: {
    system?: {
      cpu?: number;
      memTotal?: number;
      memFree?: number;
      diskTotal?: number;
      diskFree?: number;
    };
    [key: string]: any;
  } | null;
}

export interface DashboardStats {
  users: {
    total: number;
    active: number;
    pendingVerify: number;
    suspended: number;
    newToday: number;
    newThisMonth: number;
  };
  instances: {
    total: number;
    running: number;
    stopped: number;
    expired: number;
  };
  orders: {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    revenueToday: number;
    revenueThisMonth: number;
    revenueTotal: number;
  };
  subscriptions: {
    active: number;
    pastDue: number;
    cancelled: number;
    expiringSoon: number;
  };
  nodes: {
    total: number;
    online: number;
    offline: number;
    totalCpu: number;
    usedCpu: number;
    totalMemory: number;
    usedMemory: number;
    totalDisk: number;
    usedDisk: number;
  };
}

export interface TrendPoint {
  date: string;
  amount?: number;
  count?: number;
}

export interface PayConfig {
  payEnabled: boolean;
  currency: string;
  orderExpireMinutes: number;
  yipayApiUrl: string;
  yipayPid: string;
  yipayKey: string;
  yipayKeySet: boolean;
  yipaySignType: string;
}

export interface EmailConfig {
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpPassSet: boolean;
  smtpFrom: string;
  smtpFromName: string;
  notifyOrderSuccess: boolean;
  notifyExpiryReminder: boolean;
  expiryReminderDays: number;
  notifyPaymentFailure: boolean;
  notifyAdminAlert: boolean;
  adminAlertEmails: string;
}

export interface BusinessSettings {
  businessMode: boolean;
  registerEnabled: boolean;
  currency: string;
  orderExpireMinutes: number;
  defaultPlanUuid: string;
}

export interface PaymentLogEntry {
  uuid: string;
  userUuid: string;
  userName: string;
  amount: number;
  currency: string;
  subject: string;
  payGateway: string;
  payOrderNo: string;
  payTime: string;
  status: OrderStatus;
  type: OrderType;
}

export interface ImpersonateResult {
  token: string;
  user: { uuid: string; userName: string; permission: number };
}
