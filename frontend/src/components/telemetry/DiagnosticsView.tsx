import { Suspense, lazy, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { Loading } from "../States";
import { TelemetrySimpleView } from "./TelemetrySimpleView";
import { readDiagnosticsMode, writeDiagnosticsMode, type DiagnosticsViewMode } from "./diagnosticsMode";

const TelemetryDashboard = lazy(() => import("./TelemetryDashboard").then((module) => ({ default: module.TelemetryDashboard })));

export function DiagnosticsView({ batteryId }: { batteryId: number }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DiagnosticsViewMode>(() => readDiagnosticsMode());

  useEffect(() => {
    writeDiagnosticsMode(mode);
  }, [mode]);

  const setView = (next: DiagnosticsViewMode) => setMode(next);

  return (
    <div className="diagnostics-view" data-view-mode={mode}>
      <div className="diagnostics-mode-bar">
        <div className="diagnostics-mode-copy">
          <span className="eyebrow">{t("diagnostics.modeKicker")}</span>
          <p className="muted small">{t("diagnostics.modeHint")}</p>
        </div>
        <div className="telemetry-segment diagnostics-mode-switch" role="group" aria-label={t("diagnostics.modeLabel")}>
          <button type="button" className={mode === "simple" ? "active" : ""} aria-pressed={mode === "simple"} onClick={() => setView("simple")}>
            {t("diagnostics.simple")}
          </button>
          <button type="button" className={mode === "advanced" ? "active" : ""} aria-pressed={mode === "advanced"} onClick={() => setView("advanced")}>
            {t("diagnostics.advanced")}
          </button>
        </div>
      </div>

      {mode === "simple" ? (
        <TelemetrySimpleView batteryId={batteryId} onOpenAdvanced={() => setView("advanced")} />
      ) : (
        <Suspense fallback={<Loading label={t("telemetry.loading")} />}>
          <TelemetryDashboard batteryId={batteryId} />
        </Suspense>
      )}
    </div>
  );
}
