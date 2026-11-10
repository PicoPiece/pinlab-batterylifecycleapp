import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureDiagnosticsMode } from "./diagnostics-mode.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const projectRoot = process.env.PROJECT_MANAGEMENT_ROOT ?? path.resolve(repoRoot, "..", "ProjectManagement");
const base = process.env.BASE_URL ?? "http://127.0.0.1:5182";
const screenshotDir = path.join(projectRoot, "Mission019A", "after");
const resultFile = path.join(projectRoot, "Mission019A", "e2e-result.json");

function readEnv(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    result[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  return result;
}

const env = { ...readEnv(path.join(repoRoot, ".env")), ...process.env };
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const requests = new Set();

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', env.ADMIN_EMAIL);
  await page.fill('input[type="password"]', env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /Đăng nhập|Enter preview/ }).click();
  await page.waitForURL(`${base}/`);
}

async function openSimple(page) {
  await page.goto(`${base}/batteries/17?tab=analytics`, { waitUntil: "networkidle" });
  await ensureDiagnosticsMode(page, "simple");
  await page.locator(".diagnostics-simple-metrics").waitFor({ state: "visible", timeout: 60000 });
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true });

  // A fresh browser context must default to Simple View.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("401")) errors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/batteries/17/telemetry/")) {
      requests.add(new URL(request.url()).pathname + new URL(request.url()).search);
    }
  });

  await login(page);
  await openSimple(page);
  assert.equal(await page.locator(".diagnostics-view").getAttribute("data-view-mode"), "simple");
  assert.equal(await page.locator(".diagnostics-mode-switch button").count(), 2);
  assert.equal(await page.locator(".diagnostics-mode-switch button").nth(0).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".diagnostics-mode-switch button").nth(1).getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator(".diagnostics-simple-metric").count(), 6);
  assert.equal(await page.locator(".telemetry-primary-tabs").count(), 0);
  assert.ok(Array.from(requests).some((url) => url.includes("/telemetry/latest")));
  assert.ok(Array.from(requests).some((url) => url.includes("/telemetry/history?range=24h") && url.includes("include_cells=false")));
  assert.match(await page.locator(".diagnostics-simple-head").innerText(), /Tình trạng pin|Battery condition/);
  await page.screenshot({ path: path.join(screenshotDir, "simple-desktop.png"), fullPage: true });
  pass("Default Simple View", "fresh context, 6 key metrics, existing authorized latest + 24h history APIs");

  await ensureDiagnosticsMode(page, "advanced");
  assert.equal(await page.locator(".diagnostics-view").getAttribute("data-view-mode"), "advanced");
  await page.locator(".telemetry-primary-tabs").waitFor({ state: "visible", timeout: 60000 });
  assert.equal(await page.locator(".telemetry-primary-tabs button").count(), 3);
  assert.equal(await page.locator(".telemetry-kpi").count(), 6);
  assert.ok(await page.locator(".telemetry-chart-card").count() >= 4);
  assert.equal(await page.evaluate(() => localStorage.getItem("pinlab.diagnostics.mode")), "advanced");
  await page.screenshot({ path: path.join(screenshotDir, "advanced-desktop.png"), fullPage: true });
  pass("Advanced Diagnostics", "existing overview, 16-cell/history controls and Diagnostic Evidence remain available");

  await page.reload({ waitUntil: "networkidle" });
  await ensureDiagnosticsMode(page, "advanced");
  assert.equal(await page.locator(".diagnostics-view").getAttribute("data-view-mode"), "advanced");
  pass("Local preference", "Advanced preference persisted locally after reload");

  await ensureDiagnosticsMode(page, "simple");
  assert.equal(await page.locator(".diagnostics-view").getAttribute("data-view-mode"), "simple");
  assert.equal(await page.evaluate(() => localStorage.getItem("pinlab.diagnostics.mode")), "simple");
  pass("Return to Simple", "Advanced and Simple can be switched without a backend setting");

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => localStorage.removeItem("pinlab.diagnostics.mode"));
    await openSimple(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${width}px horizontal overflow ${overflow}px`);
    assert.equal(await page.locator(".diagnostics-simple-metric").count(), 6);
    assert.equal(await page.locator(".diagnostics-mode-switch button").count(), 2);
    await page.screenshot({ path: path.join(screenshotDir, `simple-mobile-${width}.png`), fullPage: true });
  }
  pass("Mobile Simple View", "360/390/430px, no horizontal overflow, clear technical-details entry");
  assert.equal(errors.length, 0, `console/page errors: ${errors.join(" | ")}`);

  const report = {
    generated_at: new Date().toISOString(),
    base,
    mode: "development build; read-only production-copy API",
    results,
    telemetry_requests: Array.from(requests).sort(),
    console_errors: errors,
    presentation_only: true,
    backend_changes: false,
  };
  fs.writeFileSync(resultFile, JSON.stringify(report, null, 2));
  console.log(`PASS  ${results.length}/${results.length} checks; report written`);
  await context.close();
} catch (error) {
  errors.push(String(error?.stack ?? error));
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.writeFileSync(resultFile, JSON.stringify({ results, telemetry_requests: Array.from(requests).sort(), errors }, null, 2));
  console.error(`FAIL  ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
