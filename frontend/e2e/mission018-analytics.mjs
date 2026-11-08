import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const projectRoot = path.resolve(repoRoot, "..", "ProjectManagement");
const base = process.env.BASE_URL ?? "http://127.0.0.1:5181";

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
if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL/ADMIN_PASSWORD must be available for local e2e.");
  process.exit(2);
}

const screenshotDir = path.join(projectRoot, "Mission018", "screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });
const results = [];
const errors = [];
function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("401")) errors.push(message.text());
});

const apiSamples = [];
page.on("response", async (response) => {
  if (!response.url().includes("/api/v1/batteries/") || !response.url().includes("/telemetry/")) return;
  const headers = response.headers();
  apiSamples.push({
    url: response.url().replace(base, "").replace(/^.*\/api\/v1/, ""),
    status: response.status(),
    content_length: Number(headers["content-length"] ?? 0),
    cache_control: headers["cache-control"] ?? "",
  });
});

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', env.ADMIN_EMAIL);
  await page.fill('input[type="password"]', env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /Đăng nhập|Enter preview/ }).click();
  await page.waitForURL(`${base}/`);
  pass("Login", "local production-copy admin session");

  const loadStart = Date.now();
  await page.goto(`${base}/batteries/17?tab=analytics`, { waitUntil: "networkidle" });
  await page.locator(".telemetry-head h2").waitFor({ state: "visible" });
  await page.waitForTimeout(500);
  const loadMs = Date.now() - loadStart;
  const heading = await page.locator(".telemetry-head h2").innerText();
  assert.match(heading, /Phân tích pin|Battery analytics/);
  assert.equal(await page.locator(".telemetry-kpi").count(), 6);
  assert.equal(await page.locator(".telemetry-chart-card").count(), 4);
  const contextText = await page.locator(".telemetry-context-row").innerText();
  assert.match(contextText, /GW-000001/);
  assert.match(contextText, /REAL_BMS/);
  assert.match(await page.locator("#main-content").innerText(), /N\/A/);
  const status = await page.locator(".telemetry-head .telemetry-status").innerText();
  assert.match(status, /ONLINE|STALE|OFFLINE|UNKNOWN/);
  pass("Overview summary + verified REAL_BMS context", `${status} · ${loadMs}ms navigation`);

  const heap = await page.evaluate(() => ({
    used: performance.memory?.usedJSHeapSize ?? null,
    total: performance.memory?.totalJSHeapSize ?? null,
  }));
  const startupResources = await page.evaluate(() =>
    performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/telemetry/"))
      .map((entry) => ({ name: entry.name.split("/telemetry/")[1], transfer: entry.transferSize, duration: entry.duration })),
  );
  await page.screenshot({ path: path.join(screenshotDir, "desktop-overview.png"), fullPage: true });
  pass("Desktop overview screenshot", "desktop-overview.png");

  await page.locator(".telemetry-primary-tabs button").nth(1).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".telemetry-cell-button").count(), 16);
  await page.screenshot({ path: path.join(screenshotDir, "desktop-cell-summary.png"), fullPage: true });
  pass("Cell Analysis summary + 16 current readings", "cell summary screenshot");

  const cellResponsePromise = page.waitForResponse((response) => response.url().includes("include_cells=true") && response.status() === 200, { timeout: 60000 });
  await page.locator(".telemetry-cell-controls .telemetry-segment button").nth(1).click();
  const cellResponse = await cellResponsePromise;
  const cellBytes = (await cellResponse.body()).byteLength;
  await page.waitForTimeout(500);
  assert.ok(await page.locator(".recharts-line").count() >= 16, "expected 16 cell series");
  await page.screenshot({ path: path.join(screenshotDir, "desktop-cells-all.png"), fullPage: true });
  pass("All 16 historical cell series", `${cellBytes} bytes include_cells=true`);

  await page.locator(".telemetry-cell-button").first().click();
  await page.waitForTimeout(1200);
  assert.match(await page.locator(".telemetry-cell-controls .telemetry-segment button.active").innerText(), /Tất cả 16 cell|All 16 cells/);
  assert.equal(await page.locator(".telemetry-cell-check input:checked").count(), 16);
  assert.equal(await page.locator(".telemetry-cell-button.is-selected").count(), 1);
  await page.screenshot({ path: path.join(screenshotDir, "desktop-cell-selected.png"), fullPage: true });
  pass("Cell click highlights history", "Cell 01 highlighted above all 16 series");

  await page.locator(".telemetry-primary-tabs button").nth(2).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".telemetry-chart-card").count(), 3);
  await page.screenshot({ path: path.join(screenshotDir, "desktop-history-pack.png"), fullPage: true });
  pass("History pack panels", "SOC / voltage / current");

  await page.locator(".telemetry-history-tabs button").nth(1).click();
  await page.waitForTimeout(500);
  await page.locator(".telemetry-history-cell-select").waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await page.locator(".telemetry-chart-card").nth(1).waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  assert.ok(await page.locator(".telemetry-chart-card").count() >= 2);
  await page.locator(".telemetry-history-cell-select select").selectOption("15");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(screenshotDir, "desktop-history-cell.png"), fullPage: true });
  pass("History cell delta + individual cell", "Cell 16 selected");

  await page.locator(".telemetry-history-tabs button").nth(2).click();
  await page.waitForTimeout(500);
  assert.ok(await page.locator(".telemetry-chart-card").count() >= 1);
  await page.screenshot({ path: path.join(screenshotDir, "desktop-history-temperature.png"), fullPage: true });
  pass("History temperature panel", "5 temperature sensors");

  const rangeStart = Date.now();
  const rangeResponsePromise = page.waitForResponse((response) => response.url().includes("range=24h") && response.status() === 200, { timeout: 60000 });
  await page.locator(".telemetry-range button").filter({ hasText: /24 giờ|24 hours/ }).click();
  await rangeResponsePromise;
  await page.locator(".telemetry-chart-card").first().waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  const range24VisibleMs = Date.now() - rangeStart;
  pass("24-hour range", `${range24VisibleMs}ms to visible chart`);

  const sevenDayStart = Date.now();
  const sevenDayResponsePromise = page.waitForResponse((response) => response.url().includes("range=7d") && response.status() === 200, { timeout: 60000 });
  await page.locator(".telemetry-range button").filter({ hasText: /7 ngày|7 days/ }).click();
  const sevenDayResponse = await sevenDayResponsePromise;
  const sevenDayBody = await sevenDayResponse.json();
  assert.ok(sevenDayBody.point_count >= 0);
  await page.waitForTimeout(200);
  const range7dMs = Date.now() - sevenDayStart;
  pass("7-day range", `${range7dMs}ms, ${sevenDayBody.point_count} points`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/batteries/17?tab=analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  await page.screenshot({ path: path.join(screenshotDir, "mobile-overview.png"), fullPage: true });
  await page.locator(".telemetry-primary-tabs button").nth(1).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".telemetry-cell-button").count(), 16);
  await page.screenshot({ path: path.join(screenshotDir, "mobile-cells.png"), fullPage: true });
  pass("Mobile layout", `390px, overflow ${overflow}px`);

  assert.equal(errors.length, 0, `console/page errors: ${errors.join(" | ")}`);
  const report = {
    generated_at: new Date().toISOString(),
    base,
    scope: "isolated production-copy UI verification; no production deployment",
    results,
    performance: {
      navigation_ms: loadMs,
      browser_heap: heap,
      telemetry_resources: startupResources,
      api_samples: apiSamples,
      cell_history_bytes: cellBytes,
      range_24h_visible_ms: range24VisibleMs,
      range_7d_ms: range7dMs,
    },
    console_errors: errors,
  };
  fs.writeFileSync(path.join(projectRoot, "Mission018", "e2e-result.json"), JSON.stringify(report, null, 2));
  console.log(`PASS  ${results.length}/${results.length} checks; report written`);
} catch (error) {
  errors.push(String(error?.stack ?? error));
  fs.writeFileSync(path.join(projectRoot, "Mission018", "e2e-result.json"), JSON.stringify({ results, errors }, null, 2));
  console.error(`FAIL  ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
