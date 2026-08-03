# Security Audit

**Project:** MCEManager (MCSManager commercial edition)
**Scope:** Business subsystem added in Phase 1-6 (user registration/email verification, plans/templates, orders/payment, subscriptions, provisioning, admin panel)
**Date:** 2026-08-03

This document records the security review performed across the commercial
features. Each item lists the risk, the mitigation implemented, and where the
code lives. Items marked **[Recommendation]** are hardening suggestions that do
not block deployment.

---

## 1. Authentication & Authorization

| Area | Risk | Mitigation | Location |
|------|------|------------|----------|
| Public registration | Spam accounts | `registerEnabled` defaults to **false**; register only open when an admin enables it | `panel/src/app/entity/setting.ts` |
| Login before email verification | Unverified accounts | Login is rejected while `emailVerified === false` or `status !== ACTIVE`; SSO path is exempt by design | `panel/src/app/service/passport_service.ts` |
| Email verification token | Token guessing | 256-bit CSPRNG token (`randomBytes(32)`), single-use, 24h expiry | `panel/src/app/service/email_service.ts` |
| Admin routes | Privilege escalation | Every admin route uses `permission({ level: ROLE.ADMIN })`; user routes validate ownership via `getUserUuid(ctx)` | `panel/src/app/routers/*` |
| Impersonation (admin take-over) | Session hijack | Requires admin, logged as an operation-log entry; produces a short-lived token, not a persistent credential | `admin_user_router.ts` |
| Password policy | Weak credentials | Enforced 9-36 char with upper/lower/digit; bcrypt hashing | `user_service.ts` |

## 2. Payment Gateway (Yipay / 易支付)

| Area | Risk | Mitigation | Location |
|------|------|------------|----------|
| Callback forgery | Fake "paid" notifications | Signature verified (MD5 by default) using the merchant key; mismatch rejects with plain `failure` | `pay_service.ts`, `pay_router.ts` |
| Replayed callbacks | Double processing | Idempotency: status transition runs synchronously before any `await`; `payTime` set once; already-handled orders return without touching the state machine | `order_service.ts#handlePaymentSuccess` |
| Amount tampering | Underpaid orders accepted | Callback amount is compared to the expected order amount; mismatch marks the order FAILED and rejects | `order_service.ts` |
| Raw evidence | Disputes / manual review | Full raw callback payload stored on `payRawData` | `order_service.ts`, `admin_order_router.ts` |
| Secret leakage | Merchant key exposure | API never returns the key; UI returns a masked form (`****`) and only a set-flag | `admin_config_router.ts` |
| HTTP endpoint abuse | Flooding the callback URL | Callback route is public by necessity but rejects invalid signatures fast; rate-limit via reverse proxy recommended | `pay_router.ts` |

## 3. Provisioning & Instance Lifecycle

| Area | Risk | Mitigation | Location |
|------|------|------------|----------|
| Provisioning without payment | Free instances | `provision()` only runs on orders in PAID state; `markProvisioning` is an atomic guard | `provision_service.ts`, `order_service.ts` |
| Node selection | Node resource exhaustion | Prefers `plan.daemonId`, else first available node; orders created before a pre-flight resource check | `provision_service.ts` |
| Daemon commands | Shell/container injection | Config values are validated (length/format) before passing to daemon; no raw shell interpolation on the panel side | `provision_service.ts`, AGENTS.md §4.3 |
| Instance expiry | Stale running instances | `endTime` written to daemon config; daemon force-stops at expiry; subscription scheduler enforces stop/resume/delete | `subscription_service.ts` |
| Data retention | Disk exhaustion | Grace period of 3 days, then instance + files deleted; subscriptions removed from user list | `subscription_service.ts` |

## 4. Scheduled Tasks & Long-lived State

| Area | Risk | Mitigation | Location |
|------|------|------------|----------|
| Subscription billing | Double-charging | Status machine + `nextPaymentAt` scheduling; renewal orders de-duplicated (`findPendingRenew`) | `subscription_service.ts` |
| Retry storms | Repeated mail / orders | Max 3 balance retries at 1/3/7 days, then PAST_DUE + instance stop | `subscription_service.ts` |
| Expiry reminder spam | Duplicate emails | `reminderSentAt` guard — sent at most once per billing period | `subscription_service.ts` |
| Node heartbeat log | Unbounded growth | JSONL store capped at 2000 events; oldest trimmed automatically | `heartbeat_service.ts` |
| Stats snapshots | Unbounded growth | Daily snapshots capped at 730 entries (~2 years) | `stats_service.ts` |
| In-memory maps | Memory leak | All maps are loaded from/backed by persistent storage; schedulers use guard flags to avoid duplicate instances | `*.service.ts` |

## 5. Email Service

| Area | Risk | Mitigation | Location |
|------|------|------------|----------|
| SMTP credential exposure | Config leak | Password masked in API responses; write-only | `admin_config_router.ts` |
| Open relay | Spam relay | Mail is only sent to verified user addresses or configured admin addresses; no arbitrary-address endpoint for normal users | `email_service.ts` |
| SMTP failure | Silent loss | Failures are logged with context; best-effort notifications never throw to business callers | `email_service.ts` |
| Admin alert recipients | Misconfiguration | Recipients validated (must contain `@`); empty config silently disables alerts | `email_service.ts` |

## 6. Input Validation & Injection

| Area | Risk | Mitigation | Location |
|------|------|------------|----------|
| Plan/template fields | Malicious config | Numeric bounds, string lengths, URL protocol checks (`http(s)://`), enum validation | `plan_service.ts`, `template_service.ts`, `admin_config_router.ts` |
| Order amounts | Negative / overflow | Amounts coerced via `Number()` and checked `> 0` on order creation | `order_router.ts` |
| Query pagination | Resource exhaustion | `page`/`page_size` clamped (`pageSize` max 50/100/500 depending on endpoint) | `order_service.ts`, `admin_*_router.ts` |
| Path traversal | File access | `JsonlStorageSubsystem` blocks `..`, `\`, `//` in logical paths; file uploads validated by `FileManager.checkFileName` | `jsonl_storage.ts`, `settings_router.ts` |

## 7. Hardening Recommendations

- **[Recommendation]** Put the panel behind a reverse proxy (Nginx/Caddy) with
  TLS and rate limiting; enable `reverseProxyMode` and set
  `reverseProxyHeader` to a trusted header. See `docs/DEPLOYMENT.md`.
- **[Recommendation]** Run the panel/daemon as a dedicated non-root user.
  The one-click installer offers `--user mcsm`.
- **[Recommendation]** Enable 2FA (`open2FA`) for admin accounts.
- **[Recommendation]** Keep `registerEnabled` off until SMTP is configured and
  tested, otherwise users cannot verify and will be locked out.
- **[Recommendation]** Review `operation_logs` and `payRawData` retention;
  the operation log flushes to disk and is queryable via the admin UI.
- **[Recommendation]** The password reset endpoints (forgot/reset password)
  are designed but not yet implemented; do not advertise them in the UI.
- **[Recommendation]** When exposed to the public internet, consider placing
  the panel on a private network segment with the daemon on the same host,
  and firewalling the daemon port (default 24444) from external access.

## 8. Remediation Status

| Finding | Severity | Status |
|---------|----------|--------|
| Amount mismatch on callback rejected | High | Fixed & verified (Phase 3) |
| Idempotent payment handling | High | Fixed & verified (Phase 3) |
| Unverified-email login block | Medium | Fixed & verified (Phase 1) |
| 256-bit one-time email tokens | Medium | Fixed & verified (Phase 1) |
| Unbounded heartbeat/stats stores | Low | Fixed (Phase 6, capped JSONL) |
| Admin alert on node outage | Low | Added (Phase 6) |
