import fs from "node:fs";
import { chromium } from "playwright";
const base = "https://pinlab-app.picopiece.com";
const env = {};
for (const line of fs.readFileSync("/home/picopiece/PinLab/Projects/BatteryLifecycleApp/.env", "utf8").split("\n")) {
  if (line && !line.startsWith("#") && line.includes("=")) { const i = line.indexOf("="); env[line.slice(0, i)] = line.slice(i + 1); }
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.fill('input[type="email"]', env.ADMIN_EMAIL);
await page.fill('input[type="password"]', env.ADMIN_PASSWORD);
await page.getByRole("button", { name: /Đăng nhập|Enter preview/ }).click();
await page.waitForURL(base + "/");
await page.goto(base + "/batteries/17?tab=analytics", { waitUntil: "networkidle" });
await page.locator('.telemetry-primary-tabs button').nth(1).click();
await page.waitForTimeout(250);
await page.locator('.telemetry-cell-controls .telemetry-segment button').nth(1).click();
await page.waitForTimeout(1200);
const mainChart = page.locator('.telemetry-cell-charts .telemetry-chart-card').first();
await mainChart.scrollIntoViewIfNeeded();
await mainChart.screenshot({ path: "/home/picopiece/PinLab/Projects/ProjectManagement/Mission018_2/before/all16-chart.png" });
await page.locator('.telemetry-cell-top').screenshot({ path: "/home/picopiece/PinLab/Projects/ProjectManagement/Mission018_2/before/all16-controls.png" });
console.log(JSON.stringify({ line_count: await mainChart.locator('.recharts-line').count(), total: await page.locator('.telemetry-cell-charts .recharts-line').count() }));
await browser.close();
