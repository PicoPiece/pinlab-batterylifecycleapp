import { beforeEach, describe, expect, it } from "vitest";
import { DIAGNOSTICS_MODE_KEY, readDiagnosticsMode, writeDiagnosticsMode } from "../components/telemetry/diagnosticsMode";

describe("diagnostics view preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to simple mode", () => {
    expect(readDiagnosticsMode()).toBe("simple");
  });

  it("persists advanced mode locally", () => {
    writeDiagnosticsMode("advanced");
    expect(window.localStorage.getItem(DIAGNOSTICS_MODE_KEY)).toBe("advanced");
    expect(readDiagnosticsMode()).toBe("advanced");
  });

  it("falls back to simple for an invalid stored value", () => {
    window.localStorage.setItem(DIAGNOSTICS_MODE_KEY, "unexpected");
    expect(readDiagnosticsMode()).toBe("simple");
  });
});
