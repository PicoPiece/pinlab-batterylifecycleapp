import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureDiagnosticsMode } from "./diagnostics-mode.mjs";

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
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("401")) errors.push(message.text());
});

const results = [];
const screenshotDir = path.join(projectRoot, "Mission018_2", "after");
fs.mkdirSync(screenshotDir, { recursive: true });
function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', env.ADMIN_EMAIL);
  await page.fill('input[type="password"]', env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: /Đăng nhập|Enter preview/ }).click();
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/batteries/17?tab=analytics`, { waitUntil: "networkidle" });
  await ensureDiagnosticsMode(page, "advanced");
  await page.waitForTimeout(500);
  await page.locator(".telemetry-primary-tabs button").nth(1).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".telemetry-cell-button").count(), 16);
  const cellResponsePromise = page.waitForResponse((response) => response.url().includes("include_cells=true") && response.status() === 200, { timeout: 60000 });
  await page.locator(".telemetry-cell-controls .telemetry-segment button").nth(1).click();
  await cellResponsePromise;
  await page.waitForTimeout(700);

  const mainChart = page.locator(".telemetry-cell-charts .telemetry-chart-card").first();
  const mainLineCount = await mainChart.locator(".recharts-line").count();
  const allLineCount = await page.locator(".telemetry-cell-charts").locator(".recharts-line").count();
  assert.equal(mainLineCount, 16);
  assert.equal(allLineCount, 17); // 16 cell lines + the delta chart
  assert.equal(await page.locator(".telemetry-cell-check input:checked").count(), 16);
  assert.match(await page.locator(".telemetry-overlap-note").innerText(), /mức điện áp|voltage levels/);
  await page.locator(".telemetry-evidence-panel").waitFor({ state: "visible", timeout: 60000 });
  const evidenceText = await page.locator(".telemetry-evidence-panel").innerText();
  assert.match(evidenceText, /BẰNG CHỨNG|Diagnostic evidence/i);
  assert.match(evidenceText, /Dòng đỉnh|Peak current/i);
  assert.match(evidenceText, /mẫu|samples/i);
  await mainChart.scrollIntoViewIfNeeded();
  await mainChart.screenshot({ path: path.join(screenshotDir, "all16-chart.png") });
  await page.locator(".telemetry-cell-top").screenshot({ path: path.join(screenshotDir, "all16-controls.png") });
  await page.locator(".telemetry-overlap-note").screenshot({ path: path.join(screenshotDir, "all16-overlap-note.png") });
  await page.screenshot({ path: path.join(screenshotDir, "all16-overlap.png"), fullPage: true });
  pass("All 16 rendered series", `${mainLineCount} cell lines + 1 delta chart; overlap note visible`);

  // Highlight Cell 01 without dropping the other 15 series.
  await page.locator(".telemetry-cell-button").first().click();
  await page.waitForTimeout(500);
  assert.match(await page.locator(".telemetry-cell-controls .telemetry-segment button.active").innerText(), /Tất cả 16 cell|All 16 cells/);
  assert.equal(await page.locator(".telemetry-cell-check input:checked").count(), 16);
  assert.equal(await page.locator(".telemetry-cell-button.is-selected").count(), 1);
  assert.match(await page.locator(".telemetry-evidence-panel").innerText(), /Cell 01|Ô 01/i);
  assert.equal(await mainChart.locator(".recharts-line").count(), 18); // 16 cell series + selected min/max
  assert.match(await page.locator(".telemetry-cell-button.is-selected strong").innerText(), /3[,.]2/);
  await mainChart.screenshot({ path: path.join(screenshotDir, "highlight-chart.png") });
  await page.screenshot({ path: path.join(screenshotDir, "highlight-cell01.png"), fullPage: true });
  pass("Cell highlight keeps all 16 series", "Cell 01 selected; 16 lines remain");

  // Hover the chart and confirm the tooltip lists all selected cell values.
  await mainChart.locator(".recharts-wrapper").hover({ position: { x: 420, y: 180 } });
  await page.waitForTimeout(300);
  const tooltip = page.locator(".telemetry-tooltip-cell");
  assert.ok(await tooltip.count() > 0, "cell tooltip not visible");
  const tooltipText = await tooltip.innerText();
  assert.match(tooltipText, /Cell 01|Ô 01/);
  assert.match(tooltipText, /Cell 16|Ô 16/);
  assert.match(tooltipText, /3\.278|3,278/);
  assert.match(tooltipText, /mức điện áp|voltage levels|cells at|cell cùng/);
  await tooltip.screenshot({ path: path.join(screenshotDir, "tooltip-all-cells.png") });
  pass("Synchronized cell tooltip", "all visible cell IDs and duplicate-value explanation shown");

  // Optional relative mode preserves absolute values in the tooltip.
  const relativeToggle = page.locator(".telemetry-toggle").filter({ hasText: /So với TB|Relative to avg/ });
  await relativeToggle.click();
  await page.waitForTimeout(300);
  assert.equal(await relativeToggle.getAttribute("aria-pressed"), "true");
  await mainChart.locator(".recharts-wrapper").hover({ position: { x: 420, y: 180 } });
  await page.waitForTimeout(300);
  assert.match(await page.locator(".telemetry-tooltip-cell").innerText(), /Điện áp thực|Actual voltage/);
  await page.locator(".telemetry-tooltip-cell").screenshot({ path: path.join(screenshotDir, "relative-tooltip.png") });
  await page.screenshot({ path: path.join(screenshotDir, "relative-mode.png"), fullPage: true });
  pass("Relative voltage mode", "Δ chart + actual voltage tooltip");

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${base}/batteries/17?tab=analytics`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".telemetry-chart-card").count(), 1);
    assert.ok(await page.locator(".telemetry-mobile-chart-tabs").isVisible());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${width}px horizontal overflow ${overflow}px`);
    await page.screenshot({ path: path.join(screenshotDir, `mobile-overview-${width}.png`), fullPage: true });
    if (width === 390) {
      await page.locator(".telemetry-primary-tabs button").nth(1).click();
      await page.waitForTimeout(300);
      await page.locator(".telemetry-cell-controls .telemetry-segment button").nth(1).click();
      await page.waitForTimeout(500);
      assert.equal(await page.locator(".telemetry-cell-button").count(), 16);
      assert.equal(await page.locator(".telemetry-cell-check").count(), 0);
      const picker = page.locator(".telemetry-cell-picker-toggle");
      assert.ok(await picker.isVisible());
      await picker.click();
      assert.equal(await page.locator(".telemetry-cell-check").count(), 16);
      await page.screenshot({ path: path.join(screenshotDir, "mobile-cells.png"), fullPage: true });
    }
  }
  pass("Mobile cell usability", "360/390/430px, 0 horizontal overflow, one chart");

  assert.equal(errors.length, 0, `console/page errors: ${errors.join(" | ")}`);
  fs.writeFileSync(path.join(projectRoot, "Mission018_2", "e2e-result.json"), JSON.stringify({
    generated_at: new Date().toISOString(), base, results, console_errors: errors,
    evidence: { mainLineCount, allLineCount },
  }, null, 2));
  console.log(`PASS  ${results.length}/${results.length} checks; report written`);
} catch (error) {
  errors.push(String(error?.stack ?? error));
  fs.writeFileSync(path.join(projectRoot, "Mission018_2", "e2e-result.json"), JSON.stringify({ results, errors }, null, 2));
  console.error(`FAIL  ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
