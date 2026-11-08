import fs from "node:fs";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const base = "https://pinlab-app.picopiece.com";
const env = {};
for (const line of fs.readFileSync("/home/picopiece/PinLab/Projects/BatteryLifecycleApp/.env", "utf8").split("\n")) {
  if (line && !line.startsWith("#") && line.includes("=")) {
    const i = line.indexOf("=");
    env[line.slice(0, i)] = line.slice(i + 1);
  }
}
const evidence = { base, generated_at: new Date().toISOString(), checks: {} };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.fill('input[type="email"]', env.ADMIN_EMAIL);
await page.fill('input[type="password"]', env.ADMIN_PASSWORD);
await page.getByRole("button", { name: /Đăng nhập|Enter preview/ }).click();
await page.waitForURL(base + "/");
await page.goto(base + "/batteries/17?tab=analytics", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.locator('.telemetry-primary-tabs button').nth(1).click();
await page.waitForTimeout(250);
const cellButtons = await page.locator(".telemetry-cell-button").count();
await page.locator('.telemetry-cell-controls .telemetry-segment button').nth(1).click();
await page.waitForTimeout(1000);
const lineCount = await page.locator(".recharts-line").count();
const pathCount = await page.locator(".recharts-line-curve").count();
const checkboxes = await page.locator(".telemetry-cell-check").count();
const checked = await page.locator(".telemetry-cell-check input:checked").count();
await page.screenshot({ path: "/home/picopiece/PinLab/Projects/ProjectManagement/Mission018_2/before/all16-production.png", fullPage: true });
evidence.checks.chart = { cellButtons, lineCount, pathCount, checkboxes, checked };
await browser.close();
await page.close().catch(() => {});

// Read-only API + PostgreSQL comparison.
const dbRow = execFileSync("docker", [
  "exec", "pinlab-app-db-1", "psql", "-U", env.POSTGRES_USER, "-d", env.POSTGRES_DB,
  "-tA", "-F", "|", "-c",
  "select id,message_id,source,cell_voltages_mv::text,temperatures_c::text,measured_at,received_at,pack_voltage_v,pack_current_a,soc_pct,capacity_remaining_ah,capacity_full_ah from telemetry_samples where battery_id=17 order by received_at desc limit 1;",
], { encoding: "utf8" }).trim();
const [dbId, dbMessage, dbSource, dbCellsText, dbTempsText, dbMeasured, dbReceived, dbVoltage, dbCurrent, dbSoc, dbRemaining, dbFull] = dbRow.split("|");
evidence.database = { id: Number(dbId), message_id: dbMessage, source: dbSource, cells: JSON.parse(dbCellsText), temperatures: JSON.parse(dbTempsText), measured_at: dbMeasured, received_at: dbReceived, voltage: Number(dbVoltage), current: Number(dbCurrent), soc: Number(dbSoc), remaining: Number(dbRemaining), full: Number(dbFull) };

const login = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const api = async (path) => {
  const response = await fetch(base + "/api/v1" + path, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};
const latest = await api("/batteries/17/telemetry/latest");
const h1 = await api("/batteries/17/telemetry/history?range=1h&include_cells=true");
const h24 = await api("/batteries/17/telemetry/history?range=24h&include_cells=true");
const sample = latest.sample;
const dbCells = evidence.database.cells;
const apiCells = sample.cell_voltages_mv;
const unique = [...new Set(apiCells)].sort((a, b) => a - b);
const groups = unique.map((value) => ({ value, count: apiCells.filter((item) => item === value).length }));
evidence.checks.api = {
  latest_message_matches_db: sample.message_id === dbMessage,
  latest_id_matches_db: sample.id === Number(dbId),
  source: sample.source,
  battery_id: latest.battery_id,
  gateway_id: latest.gateway.gateway_id,
  cell_count: apiCells.length,
  cell_01_index_0: apiCells[0] === dbCells[0],
  cell_16_index_15: apiCells[15] === dbCells[15],
  api_cells_equal_db: JSON.stringify(apiCells) === JSON.stringify(dbCells),
  unique_values: unique,
  groups,
  min: sample.cell_min_mv,
  max: sample.cell_max_mv,
  min_index: sample.cell_min_index,
  max_index: sample.cell_max_index,
  average: sample.cell_avg_mv,
  delta: sample.cell_delta_mv,
  expected_min: Math.min(...apiCells),
  expected_max: Math.max(...apiCells),
  expected_delta: Math.max(...apiCells) - Math.min(...apiCells),
  h1_points: h1.point_count,
  h1_cells: h1.cells.length,
  h1_first_cell_len: h1.cells[0]?.avg_mv?.length,
  h1_last_cell_len: h1.cells.at(-1)?.avg_mv?.length,
  h1_temps_len: h1.cells.length ? h1.temperatures[0]?.values_c?.length : 0,
  h24_points: h24.point_count,
  h24_cells: h24.cells.length,
  h24_first_cell_len: h24.cells[0]?.avg_mv?.length,
  h24_last_cell_len: h24.cells.at(-1)?.avg_mv?.length,
};
console.log(JSON.stringify(evidence, null, 2));
fs.writeFileSync("/home/picopiece/PinLab/Projects/ProjectManagement/Mission018_2/before/investigation.json", JSON.stringify(evidence, null, 2));
