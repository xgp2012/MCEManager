# MCSManager 商业版面板设计文档

## 背景与目标

基于 MCSManager 二次开发商业版面板，实现以下核心功能：

1. **用户注册系统** - 开放注册 + 邮箱验证激活
2. **实例购买系统** - 三种模式：
   - 预定义套餐：管理员创建固定配置（CPU/内存/磁盘/带宽/价格），用户购买自动开通
   - 模板市场：用户浏览 Docker/进程模板，购买后自动部署
   - 订阅制租用：按月/季/年周期计费，支持自动续费
3. **模板管理** - 管理员可增删改查实例模板（Docker/进程），支持上下架、分类、版本管理
4. **带宽限制** - 实例支持上传/下载带宽限制（Mbps），套餐/模板可配置，运行时动态调整
5. **易支付集成** - 标准异步通知模式（创建订单 → 用户支付 → 异步回调 + 同步跳转）
6. **SMTP 邮件验证** - 注册时发送验证邮件，验证通过后激活账户

## 现状与约束

### 现有架构
- **Panel (后端)**: `panel/src/app/` - Koa + TypeScript，已有用户系统、SSO、权限管理
- **Daemon (节点端)**: `daemon/src/` - 实例管理、容器、文件、终端
- **Frontend (前端)**: `frontend/src/` - Vue 3 + Ant Design Vue + TypeScript

### 现有用户系统
- `user_service.ts` - 用户 CRUD、密码验证、2FA
- `passport_service.ts` - 登录、注册、Session 管理
- `login_router.ts` - `/auth/install`（初始化）、`/auth/login`、 `/auth/logout`
- `manage_user_router.ts` - 管理员创建/删除/搜索用户
- 已有 `businessMode` 配置项但未完全实现

### 约束条件
- 必须遵循项目 i18n 规范（前端 `t()`，后端 `$t()`，双大括号占位符）
- 必须使用项目 logger，不得使用 `console.*`
- 必须验证所有外部输入（路径、ID、支付参数等）
- 新增长期存储结构需有清理逻辑，防止内存泄漏
- 代码和注释必须使用英语

## 方案对比

### 方案一：最小侵入式扩展（推荐）
- 复用现有用户系统，新增 `email`、`emailVerified`、`status` 字段
- 新增套餐/订单/订阅实体，复用现有实例创建流程
- 新增支付服务，统一处理易支付回调
- 优点：改动小、风险低、复用现有权限/实例管理
- 缺点：需仔细处理现有字段兼容性

### 方案二：独立商业模块
- 完全重写用户、订单、支付模块
- 优点：架构清晰、无历史包袱
- 缺点：开发量大、需重新实现权限、实例关联、破坏现有功能

### 方案三：微服务拆分
- 支付、订单、用户独立服务
- 优点：可独立扩展
- 缺点：运维复杂、过度设计、不符合当前单体架构

**推荐方案一**：在现有单体架构基础上最小化扩展，复用现有实例创建、权限、节点管理能力。

## 详细设计

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vue 3)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  注册页   │  │  套餐列表  │  │  模板市场  │  │ 订阅管理   │     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
└───────┼─────────────┼─────────────┼─────────────┼────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Panel Backend (Koa)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Auth API │  │ Plan API │  │ Order API│  │ Subscribe│     │
│  │(注册/验证)│  │(套餐CRUD) │  │(订单/支付)│  │(订阅/续费)│     │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘     │
└───────┼─────────────┼─────────────┼─────────────┼────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core Services                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │UserService │ │PlanService │ │OrderService│ │PayService│  │
│  │(邮箱/状态)  │ │(套餐/模板)  │ │(订单生命周期)│ │(易支付)  │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
│  ┌────────────┐ ┌────────────┐                              │
│  │EmailService│ │InstanceSvc │                              │
│  │(SMTP发送)   │ │(自动开通)   │                              │
│  └────────────┘ └────────────┘                              │
└─────────────────────────────────────────────────────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Daemon Nodes                            │
│  实例创建、启动、停止、文件管理、终端                        │
└─────────────────────────────────────────────────────────────┘
```

### 关键组件设计

#### 1. 用户实体扩展 (`panel/src/app/entity/user.ts`)

```typescript
// 新增字段
export interface IUser {
  // ... 现有字段
  email: string;                    // 邮箱地址
  emailVerified: boolean;           // 邮箱是否验证
  emailVerifyToken?: string;        // 验证 token（一次性）
  emailVerifyExpire?: number;       // token 过期时间戳
  status: UserStatus;               // 账户状态
  balance: number;                  // 账户余额（用于预付费/积分）
}

export enum UserStatus {
  PENDING_VERIFY = 0,   // 待邮箱验证
  ACTIVE = 1,           // 正常
  SUSPENDED = 2,        // 暂停/封禁
  EXPIRED = 3           // 订阅过期
}
```

#### 2. 套餐实体 (`panel/src/app/entity/plan.ts` - 新建)

```typescript
export interface IPlan {
  uuid: string;
  name: string;                    // 套餐名称
  description: string;             // 描述
  type: PlanType;                  // 套餐类型
  price: number;                   // 价格（分）
  billingCycle: BillingCycle;      // 计费周期
  // 资源配额
  cpuLimit: number;                // CPU 核心数 (0=不限)
  memoryLimit: number;             // 内存 MB (0=不限)
  diskLimit: number;               // 磁盘 GB (0=不限)
  uploadLimit: number;             // 上传带宽 Mbps (0=不限)
  downloadLimit: number;           // 下载带宽 Mbps (0=不限)
  // 关联模板
  templateUuid?: string;           // 关联的模板 UUID（市场模式）
  daemonId?: string;               // 指定节点（可选）
  // 状态
  enabled: boolean;                // 是否上架
  sortOrder: number;               // 排序
  createdAt: string;
  updatedAt: string;
}

export enum PlanType {
  INSTANCE = 1,      // 通用实例套餐（预定义资源）
  TEMPLATE = 2,      // 模板套餐（市场模式，含预装环境）
  CUSTOM = 3         // 自定义（预留）
}

export enum BillingCycle {
  ONCE = 0,          // 一次性买断
  MONTHLY = 1,       // 月付
  QUARTERLY = 3,     // 季付
  YEARLY = 12        // 年付
}
```

#### 2.1 模板实体 (`panel/src/app/entity/template.ts` - 新建)

```typescript
export interface ITemplate {
  uuid: string;
  name: string;                    // 模板名称
  displayName: string;             // 显示名称
  description: string;             // 描述
  category: TemplateCategory;      // 分类
  type: TemplateType;              // 模板类型
  // 镜像/运行时配置
  dockerImage?: string;            // Docker 镜像 (type=DOCKER 时)
  dockerTag?: string;              // 镜像标签
  processCommand?: string;         // 启动命令 (type=PROCESS 时)
  processArgs?: string;            // 启动参数
  processEnv?: Record<string, string>; // 环境变量
  // 资源默认值（套餐可覆盖）
  defaultCpuLimit: number;         // 默认 CPU 核心数
  defaultMemoryLimit: number;      // 默认内存 MB
  defaultDiskLimit: number;        // 默认磁盘 GB
  defaultUploadLimit: number;      // 默认上传带宽 Mbps
  defaultDownloadLimit: number;    // 默认下载带宽 Mbps
  // 端口映射
  ports: TemplatePort[];           // 暴露端口列表
  // 文件/目录持久化
  volumes: TemplateVolume[];       // 挂载卷配置
  // 元数据
  version: string;                 // 版本号
  author: string;                  // 作者
  iconUrl?: string;                // 图标 URL
  readme?: string;                 // 说明文档
  // 状态
  enabled: boolean;                // 是否上架
  isOfficial: boolean;             // 是否官方模板
  sortOrder: number;               // 排序
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
  DOCKER = 1,      // Docker 容器模板
  PROCESS = 2      // 进程/原生命令模板
}

export interface TemplatePort {
  containerPort: number;           // 容器内端口
  protocol: 'tcp' | 'udp';         // 协议
  name: string;                    // 端口名称
  description?: string;            // 说明
}

export interface TemplateVolume {
  containerPath: string;           // 容器内路径
  hostPath?: string;               // 宿主机路径（可选，为空则匿名卷）
  name?: string;                   // 卷名称
  readOnly: boolean;               // 只读
}
```

#### 3. 订单实体 (`panel/src/app/entity/order.ts` - 新建)

```typescript
export interface IOrder {
  uuid: string;
  userUuid: string;
  planUuid: string;
  type: OrderType;
  status: OrderStatus;
  amount: number;                  // 实付金额（分）
  currency: string;                // 货币单位
  // 支付信息
  payGateway: string;              // 支付网关标识
  payOrderNo?: string;             // 支付方订单号
  payTime?: string;                // 支付时间
  payRawData?: string;             // 原始回调数据（JSON）
  // 业务信息
  instanceUuid?: string;           // 开通的实例 UUID
  daemonId?: string;               // 所在节点
  expireAt?: string;               // 到期时间（订阅制）
  autoRenew: boolean;              // 是否自动续费
  // 元数据
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export enum OrderType {
  PURCHASE = 1,      // 购买/新开通
  RENEW = 2,         // 续费
  UPGRADE = 3        // 升配
}

export enum OrderStatus {
  PENDING = 0,       // 待支付
  PAID = 1,          // 已支付，待开通
  PROVISIONING = 2,  // 开通中
  COMPLETED = 3,     // 已完成（实例已创建）
  FAILED = 4,        // 开通失败
  REFUNDED = 5,      // 已退款
  CANCELLED = 6      // 已取消（超时未支付）
}
```

#### 4. 订阅实体 (`panel/src/app/entity/subscription.ts` - 新建)

```typescript
export interface ISubscription {
  uuid: string;
  userUuid: string;
  planUuid: string;
  instanceUuid: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;      // 当前周期开始
  currentPeriodEnd: string;        // 当前周期结束
  autoRenew: boolean;              // 自动续费
  cancelAtPeriodEnd: boolean;      // 周期结束取消
  lastPaymentAt?: string;          // 最近支付时间
  nextPaymentAt?: string;          // 下次扣款时间
  failedPaymentCount: number;      // 连续扣款失败次数
  createdAt: string;
  updatedAt: string;
}

export enum SubscriptionStatus {
  ACTIVE = 1,        // 正常
  PAST_DUE = 2,      // 账单逾期
  CANCELLED = 3,     // 已取消（待周期结束）
  EXPIRED = 4        // 已过期/停止
}
```

#### 5. 邮件服务 (`panel/src/app/service/email_service.ts` - 新建)

```typescript
// 配置项扩展 SystemConfig
smtpEnabled: boolean;
smtpHost: string;
smtpPort: number;
smtpSecure: boolean;         // true=SSL, false=STARTTLS
smtpUser: string;
smtpPass: string;
smtpFrom: string;            // 发件人地址
smtpFromName: string;        // 发件人名称

// 邮件模板（使用 i18n）
interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// 核心方法
async sendVerificationEmail(user: User, verifyUrl: string): Promise<void>
async sendPasswordResetEmail(user: User, resetUrl: string): Promise<void>  // 预留
async sendOrderNotifyEmail(user: User, order: Order): Promise<void>        // 预留
```

#### 6. 支付服务 (`panel/src/app/service/pay_service.ts` - 新建)

```typescript
// 易支付统一接口抽象
interface PayGateway {
  name: string;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyCallback(query: any, body: any): Promise<VerifyResult>;
  verifyReturn(query: any): Promise<VerifyResult>;
}

interface CreateOrderParams {
  orderNo: string;           // 本地订单号
  amount: number;            // 金额（分）
  subject: string;           // 商品标题
  body: string;              // 商品描述
  notifyUrl: string;         // 异步回调地址
  returnUrl: string;         // 同步跳转地址
  extra?: Record<string, any>;
}

interface CreateOrderResult {
  payUrl: string;            // 支付页面 URL
  gatewayOrderNo?: string;   // 网关订单号
  rawData?: any;             // 原始响应
}

interface VerifyResult {
  success: boolean;
  gatewayOrderNo?: string;
  amount?: number;
  rawData?: any;
  error?: string;
}

// 标准易支付实现
class YipayGateway implements PayGateway {
  // 使用配置的商户 ID、密钥、网关地址
  // 支持 MD5/RSA 签名验证
}
```

#### 7. 实例自动开通服务 (`panel/src/app/service/provision_service.ts` - 新建)

```typescript
// 订单支付成功后自动创建实例
async provisionInstance(order: Order): Promise<ProvisionResult> {
  // 1. 获取套餐详情
  const plan = await PlanService.getByUuid(order.planUuid);
  
  // 2. 选择节点（指定节点或负载最低节点）
  const daemon = await selectDaemon(plan.daemonId);
  
  // 3. 根据套餐类型创建实例
  if (plan.type === PlanType.TEMPLATE && plan.templateUuid) {
    // 市场模式：从模板部署
    return await deployFromTemplate(daemon, plan.templateUuid, plan);
  } else {
    // 预定义套餐：创建空实例并应用资源限制
    return await createEmptyInstance(daemon, plan);
  }
}

// 资源限制应用（Docker/进程通用）
async applyResourceLimits(instanceUuid: string, plan: Plan): Promise<void> {
  // CPU: docker update --cpus / cgroups
  // Memory: docker update --memory / Java -Xmx
  // Disk: 配额监控 + 定时清理
  // Network: tc (traffic control) / Docker --network-opt / 宿主机 tc qdisc
  // 上传带宽限制: tc class add ... rate <uploadLimit>mbit
  // 下载带宽限制: tc class add ... rate <downloadLimit>mbit
}
```

### 数据流 / 接口设计

#### 认证相关 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册（发送验证邮件） | 公开 |
| GET | `/api/auth/verify-email` | 邮箱验证（token 携带在 query） | 公开 |
| POST | `/api/auth/resend-verification` | 重发验证邮件 | 公开 |
| POST | `/api/auth/login` | 登录（需 emailVerified=true） | 公开 |
| POST | `/api/auth/forgot-password` | 忘记密码（预留） | 公开 |
| POST | `/api/auth/reset-password` | 重置密码（预留） | 公开 |

#### 套餐管理 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/plan/list` | 套餐列表（前端展示） | 公开/用户 |
| GET | `/api/plan/:uuid` | 套餐详情 | 公开/用户 |
| POST | `/api/plan` | 创建套餐 | 管理员 |
| PUT | `/api/plan/:uuid` | 更新套餐 | 管理员 |
| DEL | `/api/plan/:uuid` | 删除套餐 | 管理员 |
| PUT | `/api/plan/:uuid/status` | 上架/下架 | 管理员 |

#### 订单/支付 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/order/create` | 创建订单（返回支付链接） | 用户 |
| GET | `/api/order/list` | 我的订单列表 | 用户 |
| GET | `/api/order/:uuid` | 订单详情 | 用户 |
| GET | `/api/order/:uuid/pay` | 获取支付链接（待支付订单） | 用户 |
| POST | `/api/pay/callback/:gateway` | 易支付异步回调 | 公开(网关) |
| GET | `/api/pay/return/:gateway` | 易支付同步跳转 | 公开 |
| POST | `/api/order/:uuid/cancel` | 取消订单 | 用户 |

#### 订阅管理 API

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/subscription/list` | 我的订阅列表 | 用户 |
| GET | `/api/subscription/:uuid` | 订阅详情 | 用户 |
| POST | `/api/subscription/:uuid/cancel` | 取消自动续费 | 用户 |
| POST | `/api/subscription/:uuid/renew` | 手动续费（创建续费订单） | 用户 |
| PUT | `/api/subscription/:uuid/auto-renew` | 切换自动续费 | 用户 |

#### 管理员 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/orders` | 所有订单列表 |
| GET | `/api/admin/subscriptions` | 所有订阅列表 |
| POST | `/api/admin/order/:uuid/refund` | 退款（标记+人工处理） |
| POST | `/api/admin/subscription/:uuid/force-cancel` | 强制取消订阅 |
| GET | `/api/admin/statistics` | 运营统计（收入、用户、实例） |

### 异常与边界处理

| 场景 | 处理策略 |
|------|----------|
| 邮箱验证 token 过期 | 提示重新发送，token 24 小时有效，一次性使用 |
| 易支付回调重复/乱序 | 幂等处理：订单状态机防重，记录原始回调数据 |
| 支付金额不符 | 回调验证金额，不符合标记异常订单，人工核对 |
| 实例开通失败 | 订单标记 FAILED，记录错误日志，管理员手动重试或退款 |
| 订阅扣款失败 | 重试 3 次（间隔 1/3/7 天），均失败转 PAST_DUE，停止实例 |
| 用户删除有效订阅 | 禁止删除，需先取消订阅或联系管理员 |
| 节点资源不足 | 创建订单时预检，不足时提示“资源不足，请联系管理员” |
| 并发购买同一套餐 | 订单创建加锁（Redis 分布式锁或数据库乐观锁） |

### 测试策略

1. **单元测试**
   - UserService: 邮箱验证流程、状态流转
   - PayService: 签名生成/验证、回调解析
   - ProvisionService: 实例创建参数组装

2. **集成测试**
   - 注册→验证→登录完整流程
   - 创建订单→支付回调→自动开通实例
   - 订阅到期→自动续费→扣款失败处理

3. **端到端测试**
   - 前端注册页面 → 邮箱收信 → 点击链接 → 登录成功
   - 前端套餐列表 → 点击购买 → 支付页面 → 回调 → 实例出现在列表

4. **安全测试**
   - SQL 注入、XSS、CSRF 防护
   - 支付回调签名验证防篡改
   - 邮箱验证 token 预测攻击防护

## 风险与待确认项

| 风险 | 缓解措施 |
|------|----------|
| 易支付网关差异大 | 设计网关适配器接口，首期实现标准版，后续可扩展 |
| 实例资源限制在 Docker/进程模式下差异大 | 抽象 ResourceLimiter 接口，分别实现 Docker/Process 版本 |
| 带宽限制在不同网络模式下实现复杂 | Docker: `--network-opt` / tc qdisc；进程: cgroups v2 / tc；统一抽象 NetworkLimiter |
| 订阅定时任务可靠性 | 使用数据库存储下次执行时间，启动时补跑，配合分布式锁防重复 |
| 邮件发送失败重试 | 本地队列 + 指数退避重试，记录失败日志供人工补发 |
| 管理员误操作导致数据不一致 | 关键操作记录操作日志，提供回滚/修正工具 |
| 模板导入导出格式兼容性 | 定义标准 JSON Schema，版本字段控制兼容，提供迁移脚本 |

### 管理员面板设计

#### 后端管理 API 扩展

在现有 `/api/admin` 前缀下新增以下接口：

| 模块 | 方法 | 路径 | 说明 |
|------|------|------|------|
| **仪表盘** | GET | `/api/admin/dashboard/stats` | 概览统计：用户数、实例数、订单数、收入、节点状态 |
| | GET | `/api/admin/dashboard/revenue` | 收入趋势（日/周/月） |
| | GET | `/api/admin/dashboard/registrations` | 注册趋势 |
| **用户管理** | GET | `/api/admin/users` | 用户列表（分页、搜索、筛选状态） |
| | GET | `/api/admin/users/:uuid` | 用户详情（含订单、订阅、实例） |
| | PUT | `/api/admin/users/:uuid/status` | 修改用户状态（激活/封禁/过期） |
| | PUT | `/api/admin/users/:uuid/balance` | 调整余额（充值/扣款/退款） |
| | POST | `/api/admin/users/:uuid/impersonate` | 管理员代登（生成临时 token） |
| | DEL | `/api/admin/users/:uuid` | 删除用户（检查关联资源） |
| **套餐管理** | GET | `/api/admin/plans` | 套餐列表（含下架） |
| | POST | `/api/admin/plans` | 创建套餐 |
| | PUT | `/api/admin/plans/:uuid` | 编辑套餐 |
| | PUT | `/api/admin/plans/:uuid/status` | 上架/下架 |
| | DEL | `/api/admin/plans/:uuid` | 删除套餐（检查关联订单） |
| **模板管理** | GET | `/api/admin/templates` | 模板列表（含下架、分类筛选） |
| | GET | `/api/admin/templates/:uuid` | 模板详情 |
| | POST | `/api/admin/templates` | 创建模板（支持 Docker/进程） |
| | PUT | `/api/admin/templates/:uuid` | 编辑模板 |
| | PUT | `/api/admin/templates/:uuid/status` | 上架/下架 |
| | PUT | `/api/admin/templates/:uuid/clone` | 克隆模板 |
| | DEL | `/api/admin/templates/:uuid` | 删除模板（检查关联套餐/实例） |
| | POST | `/api/admin/templates/import` | 导入模板（JSON/市场格式） |
| | GET | `/api/admin/templates/export/:uuid` | 导出模板 |
| | GET | `/api/admin/templates/categories` | 获取分类列表 |
| **订单管理** | GET | `/api/admin/orders` | 所有订单（分页、多维筛选） |
| | GET | `/api/admin/orders/:uuid` | 订单详情（含支付原始数据、开通日志） |
| | POST | `/api/admin/orders/:uuid/retry-provision` | 重试开通 |
| | POST | `/api/admin/orders/:uuid/refund` | 发起退款（标记+记录） |
| | POST | `/api/admin/orders/:uuid/mark-paid` | 手动标记已支付（人工核对后） |
| **订阅管理** | GET | `/api/admin/subscriptions` | 所有订阅列表 |
| | GET | `/api/admin/subscriptions/:uuid` | 订阅详情（含续费记录） |
| | POST | `/api/admin/subscriptions/:uuid/force-cancel` | 强制取消（立即停止实例） |
| | POST | `/api/admin/subscriptions/:uuid/renew-now` | 立即续费（创建订单+扣款） |
| | PUT | `/api/admin/subscriptions/:uuid/auto-renew` | 切换自动续费 |
| **实例管理** | GET | `/api/admin/instances` | 所有实例列表（跨节点） |
| | GET | `/api/admin/instances/:uuid` | 实例详情（资源使用、到期时间） |
| | POST | `/api/admin/instances/:uuid/extend` | 延长到期时间 |
| | POST | `/api/admin/instances/:uuid/suspend` | 暂停实例 |
| | POST | `/api/admin/instances/:uuid/resume` | 恢复实例 |
| | DEL | `/api/admin/instances/:uuid` | 删除实例（含文件） |
| **节点管理** | GET | `/api/admin/nodes` | 节点列表（状态、负载、实例数） |
| | PUT | `/api/admin/nodes/:uuid` | 编辑节点配置 |
| | POST | `/api/admin/nodes/:uuid/sync` | 手动同步节点实例 |
| **支付配置** | GET | `/api/admin/pay/config` | 获取支付配置（隐藏密钥） |
| | PUT | `/api/admin/pay/config` | 更新支付配置（商户ID、密钥、网关地址、签名方式） |
| | POST | `/api/admin/pay/test` | 测试支付配置连通性 |
| **邮件配置** | GET | `/api/admin/email/config` | 获取 SMTP 配置（隐藏密码） |
| | PUT | `/api/admin/email/config` | 更新 SMTP 配置 |
| | POST | `/api/admin/email/test` | 发送测试邮件 |
| **系统设置** | GET | `/api/admin/settings` | 获取业务相关设置 |
| | PUT | `/api/admin/settings` | 更新设置（注册开关、默认套餐、货币单位等） |
| **操作日志** | GET | `/api/admin/logs/operation` | 操作日志查询（分页、筛选） |
| | GET | `/api/admin/logs/payment` | 支付日志查询 |

#### 前端管理页面结构

```
frontend/src/views/admin/
├── Dashboard.vue              # 仪表盘概览
├── layout/
│   ├── AdminLayout.vue        # 管理后台布局（侧边栏、顶栏）
│   └── AdminMenu.ts           # 菜单配置
├── users/
│   ├── UserList.vue           # 用户列表
│   ├── UserDetail.vue         # 用户详情抽屉/页
│   └── UserForm.vue           # 创建/编辑用户
├── plans/
│   ├── PlanList.vue           # 套餐列表
│   └── PlanForm.vue           # 创建/编辑套餐
├── templates/
│   ├── TemplateList.vue       # 模板列表
│   ├── TemplateForm.vue       # 创建/编辑模板（Docker/进程切换、端口、卷、环境变量）
│   └── TemplateImport.vue     # 导入/导出模板
├── orders/
│   ├── OrderList.vue          # 订单列表
│   └── OrderDetail.vue        # 订单详情
├── subscriptions/
│   ├── SubscriptionList.vue   # 订阅列表
│   └── SubscriptionDetail.vue # 订阅详情
├── instances/
│   ├── InstanceList.vue       # 实例列表（管理员视角）
│   └── InstanceDetail.vue     # 实例详情
├── nodes/
│   └── NodeList.vue           # 节点管理
├── settings/
│   ├── PaySettings.vue        # 支付配置
│   ├── EmailSettings.vue      # 邮件配置
│   └── BusinessSettings.vue   # 业务设置
└── logs/
    ├── OperationLog.vue       # 操作日志
    └── PaymentLog.vue         # 支付日志
```

#### 权限控制

- 新增权限常量：`ROLE.SUPER_ADMIN`（超管，可管理管理员）、`ROLE.ADMIN`（普通管理员）
- 路由守卫：`/admin/*` 需 `ROLE.ADMIN` 以上
- 敏感操作（退款、强制取消、余额调整、代登）需二次确认 + 操作日志记录

#### 仪表盘关键指标

```typescript
interface AdminDashboardStats {
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
    revenueToday: number;       // 分
    revenueThisMonth: number;
    revenueTotal: number;
  };
  subscriptions: {
    active: number;
    pastDue: number;
    cancelled: number;
    expiringSoon: number;       // 7天内到期
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
```

## 实施阶段规划

### Phase 1: 基础设施 (Week 1-2)
- [x] 用户实体扩展（email、status、balance）
- [x] SMTP 邮件服务 + 配置项
- [x] 邮箱验证 API + 前端注册/验证页
- [x] 登录拦截：未验证邮箱禁止登录

> **Phase 1 Completed** (2026-08-02)
> - 决策：公开注册受 `registerEnabled` 配置控制（默认关闭）；登录校验 `emailVerified === false` 或 `status` 非 ACTIVE 时拦截；首次安装管理员自动验证（保证引导可用）；存量账户无 `emailVerified` 字段视为已验证（避免升级后锁死管理员）；SSO 登录路径不受邮箱验证拦截。
> - 交付：`User`/`IUser` 扩展、`UserStatus` 枚举、`email_service.ts`（nodemailer）、`SystemConfig` smtp/register 配置、`/auth/register` `/auth/verify-email` `/auth/resend-verification` API、前端注册页/验证页/登录入口，i18n 同步 en_US/zh_CN/zh_TW。
> - 验证：frontend `npm run type-check` 与 eslint 通过；panel `npm run build` 无新增错误（24 个存量类型错误为环境问题，与 Phase 1 无关）。

### Phase 2: 套餐与订单 (Week 2-3)
- [x] Plan 实体 + CRUD API + 前端管理页（含带宽限制字段）
- [x] Template 实体 + CRUD API + 前端管理页（Docker/进程、端口、卷、环境变量、分类、版本、导入导出）
- [x] Order 实体 + 创建/查询 API
- [x] 易支付网关抽象 + 标准实现
- [x] 支付回调/跳转处理 + 幂等保护

> **Phase 2 Completed** (2026-08-02)
> - 决策：金额以“分”为单位存储（`price`/`amount` = 分，界面 `/100` 展示）；Plan 不含货币字段，货币由订单级 `currency`（默认取设置 `currency`，默认 CNY）承载；支付网关采用接口抽象 `PayGateway`，当前实现 `YipayGateway`（易支付，MD5 签名），后续可扩展；回调必须走独立明文响应路径（`ctx.respond = false` 直接输出 `success`/`failure`），同步跳转 302 至前端 `/#/order-result?orderNo=&result=`；幂等保护在 `order_service.ts#handlePaymentSuccess`：先同步判断 `order.status !== PENDING` 提前返回（防重复回调），金额不匹配置为 FAILED 并拒绝；订单过期时间由设置 `orderExpireMinutes` 控制，取消仅允许 PENDING；`/order/:uuid/pay` 生成支付链接。公开路由（plan/template 列表与详情）用 `permission({ token: false, level: null, speedLimit: false })`；订单 API 仅归属用户可查（`getUserUuid(ctx)`）。
> - 交付：后端 `entity/{plan,template,order}.ts`、`service/{plan,template,order,pay}_service.ts`、`routers/{plan,template,order,pay}_router.ts`，`setting.ts` 新增支付配置（payEnabled/currency/orderExpireMinutes/yipay*），`settings_router.ts` 校验，`index.ts`/`app.ts` 接线，`operation_logger.ts` 新增 plan/template 动作类型；i18n en_US/zh_CN/zh_TW 各 3620 键（含补齐 zh_TW 缺失的 3 个 API 密钥相关键）；前端 `types/business.ts`、`services/apis/{plan,template,order}.ts`、`views/admin/{PlanManagement,TemplateManagement}.vue`、`views/shop/{Shop,OrderList,OrderResult}.vue`、路由注册（`/admin/plans`、`/admin/templates`、`/shop`、`/shop/orders`、`/order-result`）。
> - 验证：frontend `npm run type-check` 通过、`npm run build-only` 构建成功、`npm test`（vitest）通过；panel `npm run build` 无新增错误（24 个存量类型错误为环境问题，与 Phase 2 无关）；`npx tsc --noEmit` 新增文件 0 错误；三语言文件键集合一致（3620/3620/3620）。

### Phase 3: 自动开通 (Week 3-4)
- [x] ProvisionService 实例自动创建
- [x] Docker/进程资源限制应用（CPU、内存、磁盘、上传/下载带宽 tc）
- [x] 订单状态机完善（支付成功→开通中→完成/失败）
- [x] 前端购买流程：套餐列表→确认→支付→结果页

> **Phase 3 Completed** (2026-08-03)
> - 决策：仅 Docker 实例应用硬件/带宽限制（`cpuUsage`=CPU 核数、`memory`=MB、`maxSpace`=GB、`uploadSpeedLimit`/`downloadSpeedLimit`=KB/s，计划带宽 Mbps→KB/s 按 1 Mbps = 125 KB/s 换算）；PROCESS 进程型仅设置 `endTime` 到期时间并记录 warning（原生进程无法强制资源限制）；TEMPLATE 套餐先实现基础 Docker/进程配置部署（Docker：image:tag、env、ports、持久卷 hostPath 映射，匿名卷跳过并告警；PROCESS：仅 startCommand+endTime）；Order 新增 `remark` 字段承载失败原因（前端结果页展示）。开通流程幂等：`provision()` 仅处理 PAID 订单，`markProvisioning`（原子 CAS）先置 PROVISIONING 再请求 daemon `/instance/new`；成功写入用户 `instances`（含 daemonId）后 `completeProvision`（COMPLETED + instanceUuid/daemonId/expireAt），失败 `failProvision`（FAILED + remark）。节点选择优先 plan.daemonId，否则第一个 available 节点。启动时 `recoverPendingOrders()` 火警式（fire-and-forget）补开通遗留 PAID 订单。支付 return 改为经 `/api/pay/return/:gateway` 验证签名后 302 到前端结果页；前端结果页 3 秒轮询直至 COMPLETED/FAILED/REFUNDED/CANCELLED 终止态。
> - 交付：`entity/order.ts`（remark）、`service/order_service.ts`（markProvisioning/completeProvision/failProvision/handlePaymentSuccess 金额校验）、`service/provision_service.ts`（新建，provision/recoverPendingOrders/selectDaemon/buildInstanceConfig）、`routers/{pay,order}_router.ts`（回调/return 触发开通、returnUrl 经面板验证）、`app.ts`（启动恢复）、`settings_router.ts` 支付配置补齐；i18n en_US/zh_CN/zh_TW 各 3647 键（新增 PROVISION*/ORDER_RESULT*/SHOP_CONFIRM* 系列）；前端 `types/business.ts`（Order.remark）、`views/shop/{Shop,OrderResult}.vue`（购买确认弹窗、结果页轮询）、`services/apis/order.ts`（getOrder 须传具体 url 路径参数）。
> - 验证：frontend `npm run type-check` 通过、`npm run build-only` 构建成功、`npm test`（vitest 4/4）通过；panel `npm run build` 无新增错误（24 个存量类型错误为环境问题，与 Phase 3 无关，webpack 已确认无 Phase 3 文件引用）；三语言文件键集合一致（3647/3647/3647）。

### Phase 4: 订阅与市场 (Week 4-5)
- [x] Subscription 实体 + 定时扣费任务
- [x] 模板市场：Template 关联 Plan，用户浏览/购买/部署
- [x] 从模板部署实例（复用现有快速部署逻辑，应用套餐资源限制覆盖模板默认值）
- [x] 前端：订阅管理页、模板市场页（用户视角）

> **Phase 4 Completed** (2026-08-03)
> - 决策：自动续费采用**余额自动扣款**，余额不足时创建 RENEW 订单走支付网关兜底，并按 1/3/7 天重试 3 次，仍失败则置为 PAST_DUE 并停止实例；模板市场交互为**选模板 → 选关联的 TEMPLATE 套餐 → 购买**；实例到期处理：停止实例并**保留数据 3 天**，未续费则删除实例与文件（`instance/delete { deleteFile: true }` + 同步用户 `instances` 列表）；订阅在**周期性套餐（MONTHLY/QUARTERLY/YEARLY）订单 COMPLETED 时自动创建**，ONCE 套餐不创建。生命周期：ACTIVE →（取消）CANCELLED →（到期未续费）EXPIRED →（3 天宽限期结束）终止删除；手动续费优先扣余额，余额不足返回 RENEW 订单与支付链接。实例到期时间通过 daemon `instance/update` 写入 `config.endTime`，由 daemon 自动强停兜底。
> - 交付：后端 `entity/subscription.ts`（`SubscriptionStatus` 枚举 + 时间戳统一 epoch ms）、`service/subscription_service.ts`（新建，CRUD/余额续费/手动续费/RENEW 订单/取消/自动续费开关/定时调度 `node-schedule` `*/1 * * * *` 含启动补扫、PAST_DUE/EXPIRED 处理、实例 stop/resume/endTime/delete、3 天数据保留、1/3/7 天重试）、`service/order_service.ts`（findPendingRenew/completeRenew/failRenew）、`routers/subscription_router.ts`（新建，list/detail/cancel/auto-renew/renew，list 附用户余额）、`routers/template_router.ts`（`/template/market` 公开接口，模板带可购 TEMPLATE 套餐）、`service/provision_service.ts`（开通完成后自动建订阅）、`routers/pay_router.ts`（RENEW 订单回调走 `renewFromOrder`）、`routers/order_router.ts`（周期性套餐 `autoRenew` 默认开启）、`index.ts`/`app.ts` 接线（初始化 + 启动调度）；i18n en_US/zh_CN/zh_TW 各 3705 键（新增 SUBSCRIPTION*/TEMPLATE_MARKET*/SHOP_TABS*/USER_BALANCE* 系列，后端键用 i18next 双大括号、前端键用 vue-i18n 单大括号）；前端 `types/business.ts`（Subscription/MarketTemplate/SubscriptionListResult/RenewResult）、`services/apis/subscription.ts`（新建）、`services/apis/template.ts`（getMarketTemplates）、`views/shop/{SubscriptionList,TemplateMarket}.vue`（新建）、`config/router.ts`（`/shop/market` 公开、`/shop/subscriptions` 需登录，Shop 页新增分段导航）。
> - 验证：frontend `npm run type-check` 通过、`npm run build` 构建成功、eslint 0 错误；panel `npm run build` 无新增错误（24 个存量类型错误为环境问题，与 Phase 4 无关，webpack 已确认无 Phase 4 文件引用）；三语言文件键集合一致（3705/3705/3705）。

### Phase 5: 管理员面板 (Week 5-6)
- [x] 后端 Admin API 全套实现（仪表盘、用户、套餐、模板、订单、订阅、实例、节点、配置、日志）
- [x] 前端 AdminLayout + 侧边栏菜单 + 路由守卫
- [x] 仪表盘：统计卡片 + 收入/注册趋势图表（ECharts/Recharts）
- [x] 用户管理：列表、详情、状态修改、余额调整、代登
- [x] 套餐管理：列表、创建/编辑表单（含带宽）、上下架
- [x] 模板管理：列表、创建/编辑（Docker/进程切换、端口映射、挂载卷、环境变量、分类、版本、图标）、上下架、克隆、导入导出
- [x] 订单管理：列表、详情、重试开通、退款、手动标记支付
- [x] 订阅管理：列表、详情、强制取消、立即续费、自动续费切换
- [x] 实例管理：跨节点列表、延期、暂停/恢复、删除、带宽调整
- [x] 节点管理：列表、编辑、同步
- [x] 支付配置：易支付参数、测试连通性
- [x] 邮件配置：SMTP 参数、测试发送
- [x] 业务设置：注册开关、货币、默认套餐等
- [x] 操作日志/支付日志：查询、CSV 导出

### Phase 6: 运营与完善 (Week 6-7)
- [x] 邮件通知模板（订单成功、到期提醒、扣费失败、管理员报警）
- [x] 定时任务：订阅扣费、到期检查、节点心跳、统计聚合
- [x] 压力测试 + 安全审计
- [x] 文档编写 + 部署指南

> **Phase 6 Completed** (2026-08-03)
> - 决策：通知类邮件独立开关（`notifyOrderSuccess`/`notifyExpiryReminder`/`notifyPaymentFailure`/`notifyAdminAlert`）统一挂在 SMTP 设置下；到期提醒天数 `expiryReminderDays`（1-60，默认 3），`adminAlertEmails` 为逗号分隔的告警接收邮箱；到期提醒每周期仅发一次（`reminderSentAt < currentPeriodStart` 守卫，续费成功后重置），避免重复打扰。心跳与统计采用**JSONL 追加 + 启动 catch-up 补写**策略，滚动上限（心跳 2000 条 / 统计 730 天），同时满足磁盘安全与查询需求；统计聚合按「自然日」幂等（当天存在则覆盖，否则追加）。
> - 交付：邮件 `service/email_service.ts`（sendOrderSuccessEmail/sendExpiryReminderEmail/sendPaymentFailureEmail/sendAdminAlertEmail + sendTestEmail 复用）；`setting.ts` 新增 6 个通知配置字段；`admin_config_router.ts` 邮件配置读写 + 天数校验；`subscription_service.ts` 到期提醒 + 扣费失败通知（余额不足与重试达上限转 PAST_DUE 两处）；`provision_service.ts` 开通成功邮件；**新建** `service/heartbeat_service.ts`（节点心跳 JSONL `/node_heartbeats`，上下线记录 + 离线管理员告警，`/nodes/heartbeats` 接口）与 `service/stats_service.ts`（每日业务快照 JSONL `/stats_daily`，`aggregateNow` 幂等聚合，`/dashboard/stats-history` 接口）；`app.ts` 启动两个新调度器；`admin_node_router.ts` 节点列表附 lastSeen；i18n en_US/zh_CN/zh_TW 各 3949 键（新增 EMAIL_*/HEARTBEAT_*/STATS_*/ADMIN_NOTIFY* 系列）；前端 `types/business.ts`（EmailConfig 扩展）、`views/admin/Settings.vue`（通知配置 UI 分区）。另交付 `scripts/stress-test.mjs`（零依赖 HTTP 压测，输出吞吐/p50/p90/p95/p99）、`SECURITY_AUDIT.md`（安全审计报告）、`docs/DEPLOYMENT.md`（部署指南）、`install.sh`（一键安装，参考 MCSManager setup_cn.sh）、`scripts/release-build.sh`/`scripts/release-build.ps1`（发布打包，参考官方 release.yml）。
> - 验证：frontend `npm run build`（type-check + vite）成功、`npm test`（vitest 4/4）通过；panel `npm run build` 成功（0 错误；此前 24 个存量类型错误经补齐 common/daemon/root node_modules 与重装 socket.io-client 后全部清零）；daemon `npm run build` 成功；三语言文件键集合一致（3949/3949/3949）；`scripts/stress-test.mjs` 冒烟运行通过。

---

**文档版本**: v1.2  
**创建日期**: 2026-08-02  
**更新日期**: 2026-08-03  
**状态**: 待评审