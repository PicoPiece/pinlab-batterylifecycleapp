export type DiagnosticsViewMode = "simple" | "advanced";

export const DIAGNOSTICS_MODE_KEY = "pinlab.diagnostics.mode";

export function readDiagnosticsMode(): DiagnosticsViewMode {
  if (typeof window === "undefined") return "simple";
  try {
    return window.localStorage.getItem(DIAGNOSTICS_MODE_KEY) === "advanced" ? "advanced" : "simple";
  } catch {
    return "simple";
  }
}

export function writeDiagnosticsMode(mode: DiagnosticsViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIAGNOSTICS_MODE_KEY, mode);
  } catch {
    // Local preference is optional; never block the read-only diagnostics view.
  }
}
