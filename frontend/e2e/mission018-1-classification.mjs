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

const screenshotDir = path.join(projectRoot, "Mission018_1", "screenshots");
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

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', env.ADMIN_EMAIL);
  await page.fill('input[type="password"]', env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /Đăng nhập|Enter preview/ }).click();
  await page.waitForURL(`${base}/`);

  await page.goto(`${base}/batteries/17`, { waitUntil: "networkidle" });
  await page.locator(".badge-classification-real").waitFor({ state: "visible" });
  assert.match(await page.locator(".badge-classification-real").innerText(), /Pin thật|Real battery/);
  assert.equal(await page.locator(".demo-banner").count(), 0);
  const health = await page.locator(".health-card").innerText();
  assert.match(health, /REAL_BMS/);
  assert.match(health, /35[,.]45\s*%/);
  assert.match(health, /SOH[\s\S]*N\/A/);
  assert.match(health, /GW-000001/);
  assert.match(health, /Nguồn[\s\S]*REAL_BMS|Source[\s\S]*REAL_BMS/);
  assert.equal(await page.locator(".classification-bar").count(), 1);
  const sidebarHeadline = await page.locator(".sidebar-data-card strong").innerText();
  assert.notEqual(sidebarHeadline, "Bộ dữ liệu demo");
  assert.match(sidebarHeadline, /Sản xuất|Production/);
  assert.match(await page.locator(".env-pill").innerText(), /PRODUCTION/);
  assert.match(await page.locator("#main-content").innerText(), /Chưa có measurement nhập tay|No manual measurements/);
  await page.screenshot({ path: path.join(screenshotDir, "real-passport-health.png"), fullPage: true });
  pass("REAL Passport classification + health", "classification badge, REAL_BMS health, SOH N/A");

  await page.goto(`${base}/batteries/1`, { waitUntil: "networkidle" });
  assert.match(await page.locator(".badge-classification-demo").innerText(), /DEMO/);
  assert.equal(await page.locator(".demo-banner").count(), 1);
  assert.match(await page.locator(".health-card").innerText(), /72|88|Mô phỏng|SIMULATED|Demo/i);
  await page.screenshot({ path: path.join(screenshotDir, "demo-passport.png"), fullPage: true });
  pass("DEMO Passport retains warnings", "DEMO badge + demo banner + manual measurement health");

  await page.goto(`${base}/batteries/17?tab=analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  assert.ok(await page.locator(".telemetry-chart-card").count() >= 4);
  await page.screenshot({ path: path.join(screenshotDir, "real-analytics.png"), fullPage: true });
  pass("Mission 018 analytics preserved", "all analytics charts still render");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/batteries/17`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  assert.equal(await page.locator(".badge-classification-real").count(), 1);
  await page.screenshot({ path: path.join(screenshotDir, "real-passport-mobile.png"), fullPage: true });
  pass("Mobile classification presentation", `390px, overflow ${overflow}px`);

  assert.equal(errors.length, 0, `console/page errors: ${errors.join(" | ")}`);
  fs.writeFileSync(
    path.join(projectRoot, "Mission018_1", "e2e-result.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), base, results, console_errors: errors }, null, 2),
  );
  console.log(`PASS  ${results.length}/${results.length} checks; report written`);
} catch (error) {
  errors.push(String(error?.stack ?? error));
  fs.writeFileSync(path.join(projectRoot, "Mission018_1", "e2e-result.json"), JSON.stringify({ results, errors }, null, 2));
  console.error(`FAIL  ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
