<div align="center">
  <a href="https://github.com/xgp2012/MCEManager" target="_blank">
    <img src="./frontend/src/assets/logo.png" alt="MCEManager Logo" width="510px" />
  </a>

  <br />
  <br />

[![--](https://img.shields.io/badge/Support%20Platform-Windows/Linux/Mac-green.svg)](https://github.com/xgp2012/MCEManager)
[![Status](https://img.shields.io/badge/Node-v20.x-blue.svg)](https://nodejs.org/en/download/)
[![Status](https://img.shields.io/badge/License-Apache%202.0-red.svg)](https://github.com/xgp2012/MCEManager)
[![CI](https://github.com/xgp2012/MCEManager/actions/workflows/ci.yml/badge.svg)](https://github.com/xgp2012/MCEManager/actions/workflows/ci.yml)
[![Release](https://github.com/xgp2012/MCEManager/actions/workflows/release.yml/badge.svg)](https://github.com/xgp2012/MCEManager/actions/workflows/release.yml)
[![CodeQL](https://github.com/xgp2012/MCEManager/actions/workflows/codeql.yml/badge.svg)](https://github.com/xgp2012/MCEManager/actions/workflows/codeql.yml)

<br />
</div>

<br />

## What is this?

**MCEManager** is a **commercial edition** of [MCSManager](https://github.com/MCSManager/MCSManager) — a fast-deploying, distributed, multi-user, modern web-based management panel for **`Minecraft`**, **`Steam`**, and other game servers.

On top of the full MCSManager panel it adds a complete **pay-to-use business subsystem**:

- **User system**: open registration, email verification, account balance.
- **Plans & templates**: sell predefined plans (Docker/process) or template-based instances.
- **Orders & payment**: order lifecycle with the **Yipay (易支付)** gateway (MD5/RSA), idempotent callbacks.
- **Automatic provisioning**: instances are created on daemon nodes automatically after payment, with CPU / memory / disk / bandwidth limits.
- **Subscriptions**: periodic plans auto-renew from the account balance, fall back to manual renewal orders, and stop the instance when unpaid.
- **Operations admin panel**: dashboard with trends, user/plan/template/order/subscription/instance/node management, payment & email configuration, operation logs.
- **Email notifications**: order success, expiry reminders, payment failure, and admin alerts.

> This is a fork of [MCSManager](https://github.com/MCSManager/MCSManager) (Apache-2.0). It keeps the upstream panel/daemon functionality and adds the commercial layer on top.

<br />

## Features

1. One-click deployment of **`Minecraft`** or **`Steam`** game servers via the built-in application marketplace.
2. Compatible with most **`Steam`**-based game servers, including **`Palworld`**, **`Squad`**, **`Project Zomboid`**, **`Terraria`**, and more.
3. Customizable web interface with drag-and-drop card layout to build your ideal dashboard.
4. Full **Docker Hub** image support, with built-in multi-user access and support for commercial instance hosting services.
5. Distributed architecture, managing multiple machines from a single web panel.
6. Lightweight technology stack. The entire project can be developed and maintained with TypeScript alone.
7. **Commercial subsystem** (MCEManager additions): plans, templates, orders, payment, subscriptions, admin panel, notifications.

<br />

## Runtime Environment

The control panel runs on both **`Windows`** and **`Linux`** platforms. No database installation is required. Simply install the **`Node.js`** runtime and a few basic **decompression utilities**.

> Requires **[Node.js 20.x](https://nodejs.org/en)** or higher (Node 16 on CentOS 7).
> It is recommended to use the **latest LTS version** for best compatibility and stability.

<br />

## Installation

### Linux — One-click installer

**Recommended.** Runs on Ubuntu 18.04+ / Debian 10+ / CentOS 7+ / RHEL 7+ / Arch Linux, requires **root**:

```bash
sudo su -c "wget -qO- https://raw.githubusercontent.com/xgp2012/MCEManager/master/install.sh | bash"
```

What it does:

- Detects the OS and architecture, installs a bundled Node.js when needed.
- Downloads the latest release and installs the **web** (panel + frontend) and **daemon** components into `/opt/mcemanager`.
- Creates and starts the `mcem-web.service` and `mcem-daemon.service` systemd services.
- Prints the panel address, daemon address/key and useful `systemctl` commands.

Useful flags:

```bash
# install only one component
... | bash -s -- --install web
... | bash -s -- --install daemon

# install as the mcsm user instead of root
... | bash -s -- --user mcsm

# install from a local tarball instead of downloading
... | bash -s -- --install-source /path/to/mce_manager_linux_release.tar.gz
```

Management commands:

```bash
systemctl start|stop|restart|status mcem-web     # web panel
systemctl start|stop|restart|status mcem-daemon  # daemon node
```

> Full guide, manual installation and configuration details: **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** / **[docs/DEPLOYMENT_ZH.md](./docs/DEPLOYMENT_ZH.md)**

<br />

### Windows

**For Windows systems, it comes as a ready-to-run integrated version — download and run it immediately.**

Build the release zip first (see below), then double-click `start.bat` to launch both the web panel and daemon process.

<br />

### Manual Installation (Linux / Windows / Mac)

```bash
# Step 1: Get the source code
git clone https://github.com/xgp2012/MCEManager.git
cd MCEManager

# Step 2: Install dependencies and build
# Linux
./install-dependents.sh
./build.sh

# Windows
install-dependents.bat
build.bat

# Step 3: The output is in production-code/
#   production-code/web/app.js      -> web panel
#   production-code/web/public/     -> compiled frontend
#   production-code/daemon/app.js   -> daemon node

# Step 4: Run (production)
cd production-code/web
npm install --production && node app.js

# in another terminal
cd production-code/daemon
npm install --production && node app.js
```

Default ports: panel `23333`, daemon `24444`. The web interface auto-detects and connects to the local daemon in most cases; otherwise add a node manually.

> These steps do **not** register the services. To keep them running in the background, use `screen`/`tmux` or the provided installer.

<br />

### Building the release packages

```bash
# Linux (produces mce_manager_linux_release.tar.gz)
./scripts/release-build.sh

# Windows (produces mce_manager_windows_release.zip)
powershell -ExecutionPolicy Bypass -File scripts/release-build.ps1
```

The tarball is what `install.sh` downloads from GitHub Releases (`mce_manager_linux_release.tar.gz`), so publishing a GitHub release makes the one-click installer work out of the box.

<br />

### Continuous Integration & Automated Releases

Three GitHub Actions workflows keep the project green and produce the release packages:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI** (`ci.yml`) | push / PR to `master` / `develop` | ESLint (frontend), TypeScript type-check (all modules), full build verification |
| **Release** (`release.yml`) | GitHub Release published / manual dispatch | Builds all modules and produces the 6 release packages below |
| **CodeQL** (`codeql.yml`) | push / PR / weekly schedule | Security scanning (`security-and-quality`) |

**To publish a release** (auto-builds and attaches the packages):

```bash
git tag v<version>          # e.g. git tag v10.18.0
git push origin v<version>
```

Then create a **GitHub Release** from that tag. Publishing the Release triggers the `Release Build` workflow, which attaches these packages:

```
mce_manager_linux_release.tar.gz            mce_manager_windows_release.zip
mce_manager_linux_web_only_release.tar.gz   mce_manager_windows_web_only_release.zip
mce_manager_linux_daemon_only_release.tar.gz mce_manager_windows_daemon_only_release.zip
```

**Manual trigger** (no Release needed): open **Actions → Release Build → Run workflow**, optionally enter a version. The 6 packages are uploaded as build artifacts (kept for 30 days).

> The daemon requires a **JDK 8+** installed separately — the Java runtime is not bundled in the packages.

<br />

## Documentation

- **Deployment guide (EN):** [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
- **部署指南（中文）:** [`docs/DEPLOYMENT_ZH.md`](./docs/DEPLOYMENT_ZH.md)
- **Security audit:** [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md)
- **Design & roadmap:** [`plants.md`](./plants.md)

<br />

## Development

### Project Structure

The project comprises four core modules:

- Daemon backend (`daemon` directory) — process/Docker/file/terminal management
- Web backend (`panel` directory) — users, auth, nodes, API, and the commercial subsystem
- Web frontend (`frontend` directory) — UI
- Common library (`common` directory) — shared code

**Web Backend Responsibilities:**

- User management
- Node connectivity
- Authentication and authorization
- API services
- Orders, payment, provisioning, subscriptions, admin panel (MCEManager)

**Daemon Backend Responsibilities:**

- Process management for server instances
- Docker container operations
- File system management
- Real-time terminal access

**Web Frontend Responsibilities:**

- User interface implementation
- Web backend integration
- Direct node communication for optimized performance

### Setting Up Development Environment

```bash
npm run install   # install all dependencies + build common
npm run dev       # runs daemon + panel + frontend concurrently
```

<br />

## Browser Compatibility

MCEManager supports all major modern browsers, including:

- `Chrome`
- `Firefox`
- `Safari`
- `Opera`

**Internet Explorer (IE)** is no longer supported.

<br />

## License

This project is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

© 2025 xgp2012 / MCSManager. All rights reserved.
