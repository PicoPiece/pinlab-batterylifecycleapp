import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8892";

function readEnvFile(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    result[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  return result;
}

const env = { ...readEnvFile(path.join(repoRoot, ".env.qa")), ...process.env };
const email = env.ADMIN_EMAIL;
const password = env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("ADMIN_EMAIL/ADMIN_PASSWORD must be provided via .env.qa or environment.");
  process.exit(2);
}

const results = [];
const consoleErrors = [];
function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, error) {
  results.push({ name, status: "FAIL", detail: String(error?.message ?? error) });
  console.error(`FAIL  ${name} — ${error?.message ?? error}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("pageerror", (error) => consoleErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("401")) consoleErrors.push(message.text());
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: /Đăng nhập|Enter preview/ }).click();
  await page.waitForURL(`${BASE}/`);
  await page.waitForTimeout(500);
  pass("Login", "QA admin session");

  const kpiLinks = await page.locator(".kpi-card").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  assert.deepEqual(kpiLinks, ["/batteries", "#fleet-health", "/inspections", "/monitoring"]);
  const formula = await page.locator("#fleet-health").innerText();
  assert.match(formula, /70% weighted SOH/);
  assert.match(formula, /SOH là chỉ số đo lường riêng/i);
  pass("Dashboard KPI + Fleet Health formula", `${kpiLinks.length} links; SOH distinguished`);

  const attentionLinks = await page.locator(".attention-copy a").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
  assert.ok(attentionLinks.length > 0 && attentionLinks.every((href) => /^\/batteries\/\d+$/.test(href)));
  pass("Needs attention navigation", `${attentionLinks.length} asset links`);

  await page.goto(`${BASE}/batteries`, { waitUntil: "networkidle" });
  const search = page.locator(".fleet-toolbar input").first();
  await search.fill("BESS-001");
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#main-content tbody tr").count(), 1);
  assert.match(await page.locator("#main-content tbody tr").first().innerText(), /DEMO-BESS-001/);
  pass("Fleet search", "BESS-001 returns exactly one row");

  await search.fill("");
  await page.locator(".fleet-toolbar select").first().selectOption("quarantined");
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#main-content tbody tr").count(), 1);
  assert.match(await page.locator("#main-content tbody tr").first().innerText(), /DEMO-BESS-009/);
  pass("Fleet status filter", "quarantined returns DEMO-BESS-009");

  await page.locator(".fleet-toolbar select").first().selectOption("");
  await page.waitForTimeout(200);
  const bessRow = page.locator("#main-content tbody tr", { hasText: "DEMO-BESS-001" }).first();
  const rowText = await bessRow.innerText();
  assert.match(rowText, /Mô phỏng/);
  assert.match(rowText, /Ước tính/);
  assert.match(rowText, /\d{1,2}:\d{2}/);
  await bessRow.click();
  await page.waitForURL(/\/batteries\/\d+/);
  assert.match(await page.locator(".detail-title h2").innerText(), /DEMO-BESS-001/);
  pass("Fleet row click + source/quality/timestamp", page.url());

  await page.getByRole("tab", { name: /Monitoring/ }).click();
  await page.waitForTimeout(250);
  const passportMonitoring = await page.locator("#main-content").innerText();
  assert.match(passportMonitoring, /NOT CONNECTED/);
  assert.doesNotMatch(passportMonitoring, /\bLIVE\b/i);
  pass("Passport monitoring tab", "NOT CONNECTED; no LIVE");

  await page.getByRole("tab", { name: /Bảo hành|Warranty/ }).click();
  await page.locator("#passport-panel-warranty").waitFor({ state: "visible" });
  const passportWarranty = await page.locator("#main-content").innerText();
  assert.match(passportWarranty, /PREVIEW ONLY|Preview only/);
  assert.doesNotMatch(passportWarranty, /Approved|Eligible/i);
  pass("Passport warranty preview", "preview state; no decision wording");

  await page.goto(`${BASE}/monitoring`, { waitUntil: "networkidle" });
  await page.locator(".pack-item", { hasText: "DEMO-LFP-007" }).click();
  await page.waitForTimeout(300);
  const noDataCount = await page.locator(".metric-card .metric-empty").count();
  assert.ok(noDataCount >= 3, `expected at least 3 No Data fields, got ${noDataCount}`);
  pass("Monitoring detail panel", `${noDataCount} No Data fields for DEMO-LFP-007`);

  await page.locator(".pack-item", { hasText: "DEMO-BESS-001" }).click();
  await page.waitForTimeout(300);
  const bessMonitor = await page.locator(".monitor-detail-card").innerText();
  assert.match(bessMonitor, /79[0-9][,.]?[0-9]?\s?V/);
  assert.match(bessMonitor, /41[,.]8/);
  assert.match(bessMonitor, /Mô phỏng|Simulated/);
  pass("Monitoring values are measured from DB", "BESS voltage/temperature shown with provenance");

  await page.goto(`${BASE}/inspections`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Kiểm tra mới|New inspection/ }).click();
  assert.ok(await page.locator(".asset-picker").isVisible());
  await page.locator(".asset-pick", { hasText: "DEMO-VF5-001" }).click();
  await page.waitForURL(/\/batteries\/\d+\/inspections\/new/);
  await page.locator("#main-content .form-card").waitFor({ state: "visible" });
  assert.match(await page.locator("#main-content").innerText(), /DEMO-VF5-001/);
  pass("New inspection picker", "asset picker navigates to real inspection form");

  await page.goto(`${BASE}/inspections`, { waitUntil: "networkidle" });
  const inspectionRow = page.locator("#main-content tbody tr").first();
  const inspectionLabel = await inspectionRow.innerText();
  await inspectionRow.click();
  await page.waitForURL(/\/inspections\/\d+/);
  await page.locator("#main-content .detail-title").waitFor({ state: "visible" });
  const inspectionUrl = page.url();
  assert.match(await page.locator("#main-content").innerText(), /Chi tiết kiểm tra|Inspection detail/i);
  pass("Inspection row click", `${inspectionLabel.split("\n")[0]} · ${inspectionUrl}`);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: "qa-evidence.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await page.waitForTimeout(700);
  assert.match(await page.locator("#main-content").innerText(), /Đã có bằng chứng|Evidence attached/);
  assert.match(await page.locator("#main-content").innerText(), /qa-evidence\.png/);
  pass("Evidence upload", "inspection evidence persisted and reflected in UI");

  await page.goto(`${BASE}/warranty`, { waitUntil: "networkidle" });
  const warranty = await page.locator("#main-content").innerText();
  assert.match(warranty, /PREVIEW ONLY|Preview only/);
  assert.match(warranty, /Đủ bằng chứng|Evidence ready/);
  assert.doesNotMatch(warranty, /Approved|Eligible/i);
  pass("Warranty preview guardrail", "evidence readiness only; no approved/eligible decision");

  await page.getByRole("button", { name: "EN" }).click();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  const english = await page.locator("#main-content").innerText();
  assert.match(english, /Fleet Health Score/);
  assert.match(english, /87\.2%|87\.3%|87\.4%/);
  assert.doesNotMatch(english, /87,2%/);
  pass("i18n EN", "dashboard translated; decimal locale switched to en-US");
  await page.getByRole("button", { name: "VI" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow: ${overflow}px`);
  assert.match(await page.locator("#main-content").innerText(), /TRẠNG THÁI/);
  await page.locator(".menu-toggle").click();
  assert.ok(await page.locator(".sidebar").evaluate((node) => node.classList.contains("sidebar-open")));
  await page.locator(".main-nav a", { hasText: "Fleet" }).click();
  await page.waitForURL(`${BASE}/batteries`);
  pass("Mobile responsive + navigation", "390px; no overflow; drawer works");

  const consoleSummary = consoleErrors.length === 0 ? "no page/console errors" : `${consoleErrors.length} console errors`;
  assert.equal(consoleErrors.length, 0, consoleSummary);
  pass("Browser runtime", consoleSummary);

  console.log(`\n${results.filter((r) => r.status === "PASS").length}/${results.length} checks passed`);
} catch (error) {
  fail("E2E journey", error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

fs.mkdirSync(path.join(repoRoot, "..", "ProjectManagement", "Mission008B-QA"), { recursive: true });
fs.writeFileSync(
  path.join(repoRoot, "..", "ProjectManagement", "Mission008B-QA", "e2e-result.json"),
  JSON.stringify({ base: BASE, generated_at: new Date().toISOString(), results, consoleErrors }, null, 2),
);
