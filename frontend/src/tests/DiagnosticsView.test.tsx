import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { DiagnosticsView } from "../components/telemetry/DiagnosticsView";
import { DIAGNOSTICS_MODE_KEY } from "../components/telemetry/diagnosticsMode";

vi.mock("../components/telemetry/TelemetrySimpleView", () => ({
  TelemetrySimpleView: ({ onOpenAdvanced }: { onOpenAdvanced: () => void }) => (
    <div>
      <span>Simple mock</span>
      <button type="button" onClick={onOpenAdvanced}>Open from simple</button>
    </div>
  ),
}));

vi.mock("../components/telemetry/TelemetryDashboard", () => ({
  TelemetryDashboard: () => <div>Advanced mock</div>,
}));

function renderView() {
  return render(<I18nProvider><DiagnosticsView batteryId={17} /></I18nProvider>);
}

describe("DiagnosticsView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to Simple View and exposes a clear technical-details entry", () => {
    renderView();
    expect(screen.getByText("Simple mock")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chi tiết kỹ thuật" })).toBeTruthy();
    expect(window.localStorage.getItem(DIAGNOSTICS_MODE_KEY)).toBe("simple");
  });

  it("switches to Advanced Diagnostics and persists the local preference", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Chi tiết kỹ thuật" }));
    expect(await screen.findByText("Advanced mock")).toBeTruthy();
    expect(window.localStorage.getItem(DIAGNOSTICS_MODE_KEY)).toBe("advanced");
  });

  it("can return from Advanced Diagnostics to Simple View", async () => {
    window.localStorage.setItem(DIAGNOSTICS_MODE_KEY, "advanced");
    renderView();
    expect(await screen.findByText("Advanced mock")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tổng quan" }));
    expect(screen.getByText("Simple mock")).toBeTruthy();
    expect(window.localStorage.getItem(DIAGNOSTICS_MODE_KEY)).toBe("simple");
  });
});
