# MCEManager 部署指南

MCEManager 是基于 MCSManager 的商业版面板，新增了开放注册、邮箱验证、
套餐/模板市场、订单、支付（易支付）、订阅自动续费以及运营管理后台。

支持两种部署方式：

1. **一键安装脚本（Linux）** — 生产环境推荐。
2. **手动构建运行** — 用于开发或自定义环境。

---

## 1. 一键安装（Linux）

需要 **root** 权限，支持 Ubuntu 18.04+ / Debian 10+ / CentOS 7+ / RHEL 7+ / Arch Linux。

```bash
sudo su -c "wget -qO- https://raw.githubusercontent.com/xgp2012/MCEManager/main/install.sh | bash"
```

脚本功能：

- 检测操作系统与架构，必要时自动安装内置 Node.js（v20.x，CentOS 7 使用 v16）。
- 下载最新发布包并安装 **web**（面板+前端）与 **daemon**（节点）到 `/opt/mcemanager`。
- 创建 `mcem-web.service` 与 `mcem-daemon.service` 两个 systemd 服务并启动。
- 打印面板地址、节点地址/密钥及常用的 systemctl 管理命令。

常用参数：

```bash
# 只安装某一个组件
... | bash -s -- --install web
... | bash -s -- --install daemon

# 以 mcsm 用户安装（而非 root）
... | bash -s -- --user mcsm

# 使用本地发布包安装（而不是下载）
... | bash -s -- --install-source /path/to/mce_manager_linux_release.tar.gz
```

安装完成后，用浏览器打开面板地址，进入初始化向导创建管理员账号，然后在
「管理后台 → 设置」中配置 SMTP 与支付网关。

---

## 2. 手动构建与运行

### 前置要求

- Node.js 20.x（CentOS 7 旧系统可用 Node 16）与 npm
- Git

### 构建

```bash
git clone https://github.com/xgp2012/MCEManager.git
cd MCEManager

# Linux
./install-dependents.sh
./build.sh

# Windows
install-dependents.bat
build.bat
```

构建产物位于 `production-code/` 目录：

```
production-code/
├── daemon/                 # 节点运行目录（app.js + node_modules）
└── web/
    ├── app.js              # 面板后端
    └── public/             # 编译后的前端
```

如需生成安装脚本使用的发布包，运行 `scripts/release-build.sh`（Linux）或
`scripts/release-build.ps1`（Windows），分别产出
`mce_manager_linux_release.tar.gz` 与 `mce_manager_windows_release.zip`。

### 开发运行

```bash
npm run install        # 安装全部依赖并构建 common
npm run dev            # 同时启动 daemon + panel + frontend
```

### 生产运行（不使用安装脚本）

```bash
cd production-code/web
npm install --production
node app.js

# 另开一个终端
cd production-code/daemon
npm install --production
node app.js
```

默认端口：面板 `23333`，节点 `24444`。可在
`web/data/SystemConfig/config.json` 与 `daemon/data/Config/global.json` 中修改。

---

## 3. 配置说明

### 3.1 初始化

首次启动会进入安装向导，创建管理员账号。首个管理员会自动通过邮箱验证，
不会阻塞初始化流程。

### 3.2 邮件（SMTP）— 管理后台 → 设置 → 邮件

| 配置项 | 说明 |
|--------|------|
| 启用 SMTP | 所有外发邮件的总开关 |
| 主机 / 端口 / 安全连接 | `secure=true` 表示隐式 SSL（如 465），`false` 表示 STARTTLS（如 587） |
| 用户名 / 密码 | SMTP 认证信息 |
| 发件人 / 发件人名 | 发件人身份 |
| **通知** | 独立开关：订单成功、到期提醒、扣费失败、管理员告警，以及提醒天数（1-60）与告警接收邮箱 |

注意：若开启「开放注册」，必须先配置并测试 SMTP，否则用户无法验证邮箱，
也就无法登录。

### 3.3 支付（易支付）— 管理后台 → 设置 → 支付

| 配置项 | 说明 |
|--------|------|
| 启用支付 | 总开关 |
| 货币单位 | 如 `CNY` |
| 订单过期时间 | 待支付订单自动取消的时间（分钟，0 表示永不过期） |
| 易支付 API 地址 | 网关地址（需 `https://`） |
| 商户 ID / 密钥 | 商户标识与密钥（密钥只写不回显，显示为掩码） |
| 签名方式 | `MD5`（默认）或 `RSA` |

保存后可点击「测试」检查网关连通性。

### 3.4 业务设置 — 管理后台 → 设置 → 业务

- `业务模式` — 启用商业子系统。
- `开放注册` — 是否允许公开注册。
- `货币单位`、`订单过期时间`、`默认套餐`。

### 3.5 反向代理 + HTTPS

生产环境推荐使用 Nginx/Caddy 反代面板并启用 `reverseProxyMode`，让面板信任
代理转发 IP 头。

---

## 4. 定时任务（Phase 6）

以下任务自动运行，无需额外配置：

| 任务 | 频率 | 行为 |
|------|------|------|
| 订阅扣费 | 每分钟（启动时补扫） | 余额自动续费；余额不足生成 RENEW 订单；1/3/7 天重试；最终转 PAST_DUE 并停止实例；数据保留 3 天后删除 |
| 到期提醒 | 每分钟 | 在 `到期提醒天数` 内发送到期提醒邮件 |
| 节点心跳 | 每分钟 | 记录节点上下线记录；节点离线时向管理员发邮件 |
| 统计聚合 | 每天 00:05（启动时补算） | 持久化每日业务快照，用于仪表盘趋势 |

---

## 5. 升级

使用安装脚本：重新执行同一行命令即可。脚本会检测已安装组件，备份
`data/` 并原地更新文件。

手动升级：停止服务 → 备份 `web/data` 与 `daemon/data` → 替换 production
文件 → 重新 `npm install --production` → 重启。

---

## 6. 常见问题

- **邮件发不出去** — 先点「发送测试邮件」；确认收件人已验证；确认对应通知
  开关已打开。
- **支付回调失败** — 检查商户 ID/密钥/签名方式，确认回调地址可达；可在
  「订单管理」查看订单 `payRawData` 原始数据。
- **节点显示离线** — 检查防火墙是否放行节点端口，确认节点进程运行
  （`systemctl status mcem-daemon`）。
- **开启注册后用户无法登录** — 邮箱验证为强制步骤，可在登录页重新发送
  验证邮件。

安全加固建议见 `SECURITY_AUDIT.md`。
