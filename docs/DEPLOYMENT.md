# MCEManager Deployment Guide

MCEManager is a commercial edition of MCSManager that adds registration,
email verification, plan/template markets, orders, payment (Yipay / 易支付),
subscriptions with auto-renewal, and an operations admin panel.

Two deployment paths are supported:

1. **One-click installer (Linux)** — recommended for production.
2. **Manual build & run** — for development or custom setups.

---

## 1. One-click Installer (Linux)

Requires **root** and a supported distribution:
Ubuntu 18.04+ / Debian 10+ / CentOS 7+ / RHEL 7+ / Arch Linux.

```bash
sudo su -c "wget -qO- https://raw.githubusercontent.com/xgp2012/MCEManager/master/install.sh | bash"
```

What it does:

- Detects the OS and architecture, installs a bundled Node.js (v20.x, v16 for
  CentOS 7) when needed.
- Downloads the latest release tarball and installs the **web** (panel +
  frontend) and **daemon** components into `/opt/mcemanager`.
- Creates `mcem-web.service` and `mcem-daemon.service` (systemd) and starts
  them.
- Prints the panel address, daemon address/key and useful systemctl commands.

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

After installation, open the panel address in a browser. The first screen is
the initialisation wizard (creates the admin account). Then configure SMTP and
the payment gateway under **Admin → Settings**.

---

## 2. Manual Build & Run

### Prerequisites

- Node.js 20.x (Node 16 for older CentOS 7) and npm
- Git

### Build

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

The build script produces a `production-code/` directory containing:

```
production-code/
├── daemon/                 # daemon runtime (app.js + node_modules)
└── web/
    ├── app.js              # panel backend
    └── public/             # compiled frontend
```

To package the release tarball used by the installer, run
`scripts/release-build.sh` (Linux) or `scripts/release-build.ps1` (Windows);
both produce `mce_manager_linux_release.tar.gz` /
`mce_manager_windows_release.zip`.

### Run (development)

```bash
npm run install        # install all dependencies + build common
npm run dev            # runs daemon + panel + frontend concurrently
```

### Run (production, no installer)

```bash
cd production-code/web
npm install --production
node app.js

# in another terminal
cd production-code/daemon
npm install --production
node app.js
```

Default ports: panel `23333`, daemon `24444`. Both can be changed in
`web/data/SystemConfig/config.json` and `daemon/data/Config/global.json`.

---

## 3. Configuration

### 3.1 Initialisation

On first launch the panel opens the install wizard which creates the admin
account. The first admin is automatically email-verified so the setup flow is
never blocked.

### 3.2 Email (SMTP) — Admin → Settings → Email

| Setting | Description |
|---------|-------------|
| SMTP enabled | Master switch for all outgoing mail |
| Host / Port / Secure | SMTP server; `secure=true` = implicit SSL (e.g. 465), `false` = STARTTLS (e.g. 587) |
| User / Password | SMTP auth |
| From / From name | Sender identity |
| **Notifications** | Independent toggles: order-success, expiry reminder, payment-failure, admin alert + reminder days (1-60) and alert recipient list |

If `Register enabled` is turned on, SMTP must be configured and tested first,
otherwise users cannot verify their email and cannot log in.

### 3.3 Payment (Yipay) — Admin → Settings → Payment

| Setting | Description |
|---------|-------------|
| Pay enabled | Master switch |
| Currency | e.g. `CNY` |
| Order expire minutes | pending orders auto-cancel after this (0 = never) |
| Yipay API URL | gateway base URL (`https://...`) |
| PID / Key | merchant id / key (key is write-only, shown masked) |
| Sign type | `MD5` (default) or `RSA` |

Use **Test** to check gateway connectivity after saving.

### 3.4 Business — Admin → Settings → Business

- `Business mode` — enables the commercial subsystem.
- `Register enabled` — open public registration.
- `Currency`, `Order expire minutes`, `Default plan`.

### 3.5 Reverse proxy + HTTPS

Recommended production setup: Nginx/Caddy in front of the panel. Enable
`reverseProxyMode` in settings so the panel trusts the proxy IP header.

---

## 4. Scheduled Tasks (Phase 6)

These run automatically and require no configuration:

| Task | Cadence | Behaviour |
|------|---------|-----------|
| Subscription billing | every minute (+ catch-up on start) | balance auto-renew; RENEW orders; 1/3/7-day retries; PAST_DUE + instance stop; 3-day data retention then delete |
| Expiry reminders | every minute | emails users whose subscription expires within `expiryReminderDays` |
| Node heartbeat | every minute | records online/offline transitions; emails admin on outages |
| Statistics aggregation | daily 00:05 (+ on start) | persists daily snapshots; see Dashboard |

---

## 5. Upgrading

With the installer: re-run the same one-liner. It detects the installed
components, backs up `data/`, and updates the files in place.

Manually: stop services, back up `web/data` and `daemon/data`, replace the
production files, re-run `npm install --production`, restart.

---

## 6. Troubleshooting

- **Emails not sent** — check SMTP test button; verify the recipient is
  verified; confirm the relevant notification toggle is on.
- **Payment callback returning failure** — check PID/Key/Sign type and that
  the callback URL is reachable; inspect order `payRawData` in Admin → Orders.
- **Node shows offline** — verify firewall allows the daemon port and that the
  daemon process is running (`systemctl status mcem-daemon`).
- **Users cannot log in after enabling registration** — email verification is
  mandatory; resend verification from the login page.

See also `SECURITY_AUDIT.md` for hardening recommendations.
