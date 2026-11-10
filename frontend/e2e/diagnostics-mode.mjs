export async function ensureDiagnosticsMode(page, mode) {
  const switcher = page.locator(".diagnostics-mode-switch button");
  const advanced = switcher.filter({ hasText: /Chi tiết kỹ thuật|Technical details/i });
  const simple = switcher.filter({ hasText: /Tổng quan|Simple/i });
  const target = mode === "advanced" ? advanced : simple;

  await target.waitFor({ state: "visible", timeout: 60000 });
  if ((await target.getAttribute("aria-pressed")) !== "true") {
    await target.click();
  }

  if (mode === "advanced") {
    await page.locator(".telemetry-panel").waitFor({ state: "visible", timeout: 60000 });
  } else {
    await page.locator(".diagnostics-simple").waitFor({ state: "visible", timeout: 60000 });
  }
}
