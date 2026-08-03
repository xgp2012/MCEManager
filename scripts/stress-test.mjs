#!/usr/bin/env node
/**
 * Load / stress test tool for the MCEManager panel.
 *
 * A zero-dependency harness built on Node's http module. It fires concurrent
 * requests at a panel endpoint and reports throughput and latency percentiles
 * so operators can sanity-check the panel under load before going live.
 *
 * Usage:
 *   node scripts/stress-test.mjs --base http://localhost:23333 --concurrency 50 --duration 10
 *   node scripts/stress-test.mjs --endpoint /api/overview --concurrency 20 --requests 2000
 *
 * Options:
 *   --base         panel base URL (default http://localhost:23333)
 *   --endpoint     API path to hit (default /api/overview, must start with "/")
 *   --method       HTTP method (default GET)
 *   --concurrency  number of concurrent workers (default 20)
 *   --duration     how many seconds to run (default 10)
 *   --requests     max total requests; mutually exclusive with --duration
 *   --body         JSON body for POST requests (e.g. '{"username":"admin"}')
 *   --cookie       session cookie header value to include (optional)
 *   --timeout      per-request timeout in ms (default 10000)
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const args = parseArgs(process.argv.slice(2));

const base = new URL(args.base || "http://localhost:23333");
const endpoint = (args.endpoint || "/api/overview").startsWith("/")
  ? args.endpoint
  : "/" + args.endpoint;
const method = (args.method || "GET").toUpperCase();
const concurrency = clampInt(args.concurrency, 1, 1000, 20);
const duration = clampInt(args.duration, 1, 3600, 10);
const requests = args.requests != null ? clampInt(args.requests, 1, 1e9, Infinity) : Infinity;
const timeout = clampInt(args.timeout, 100, 60000, 10000);
const body = args.body != null ? String(args.body) : null;
const cookie = args.cookie || "";

const requester = base.protocol === "https:" ? httpsRequest : httpRequest;

console.log(
  [
    `MCEManager load test`,
    `  base:        ${base.href}`,
    `  endpoint:    ${method} ${endpoint}`,
    `  concurrency: ${concurrency}`,
    `  duration:    ${duration}s`,
    `  requests:    ${Number.isFinite(requests) ? requests : "unlimited"}`,
    `  timeout:     ${timeout}ms`,
    ""
  ].join("\n")
);

const startedAt = Date.now();
const deadline = startedAt + duration * 1000;
let sent = 0;
let completed = 0;
let failed = 0;
let timedOut = 0;
const latencies = [];
const statusCounts = new Map();
let running = true;

function sendOne() {
  if (!running) return;
  if (!Number.isFinite(requests) && sent >= requests) {
    running = false;
    return;
  }
  if (Date.now() >= deadline) {
    running = false;
    return;
  }
  sent++;

  const req = requester(
    {
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port,
      path: endpoint,
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MCEManager-stress-test",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {})
      },
      timeout
    },
    (res) => {
      let size = 0;
      res.on("data", (chunk) => (size += chunk.length));
      res.on("end", () => {
        const status = res.statusCode || 0;
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        recordLatency();
      });
      res.on("error", () => {
        failed++;
        recordLatency();
      });
    }
  );

  req.on("timeout", () => {
    timedOut++;
    req.destroy();
    recordLatency();
  });
  req.on("error", () => {
    failed++;
    recordLatency();
  });

  if (body) req.write(body);
  req.end();
}

function recordLatency() {
  latencies.push(Date.now() - startedAt);
  completed++;
  // Backpressure: only start the next request when another finished, so the
  // concurrency level is respected.
  if (running) sendOne();
}

for (let i = 0; i < concurrency; i++) sendOne();

const timer = setInterval(() => {
  if (!running && completed >= sent) {
    clearInterval(timer);
    printReport();
    process.exit(0);
  }
}, 250);

setTimeout(() => {
  if (running) {
    running = false;
  }
}, duration * 1000);

function printReport() {
  const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
  const ok = completed - failed;
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;

  console.log(`\nResults (${elapsedSec.toFixed(2)}s):`);
  console.log(`  Requests sent:   ${sent}`);
  console.log(`  Requests done:   ${completed}  (ok: ${ok}, failed: ${failed}, timeout: ${timedOut})`);
  console.log(`  Throughput:      ${(completed / elapsedSec).toFixed(2)} req/s`);
  console.log(`  Latency p50:     ${pct(0.5)}ms`);
  console.log(`  Latency p90:     ${pct(0.9)}ms`);
  console.log(`  Latency p95:     ${pct(0.95)}ms`);
  console.log(`  Latency p99:     ${pct(0.99)}ms`);
  console.log(`  Status codes:    ${[...statusCounts.entries()].map(([s, n]) => `${s}:${n}`).join(", ") || "-"}`);
  console.log(`  Error rate:      ${((failed / Math.max(1, completed)) * 100).toFixed(2)}%`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--") && argv[i + 1] != null && !argv[i + 1].startsWith("--")) {
      out[key.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
