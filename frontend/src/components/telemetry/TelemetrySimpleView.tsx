import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../../api";
import { formatDateTime, formatNumber } from "../../format";
import { useI18n } from "../../i18n";
import type { TelemetryHistory, TelemetryLatest, TelemetrySample } from "../../types";
import { EmptyState, ErrorState } from "../States";
import { TelemetryChart } from "./TelemetryCharts";
import { PACK_COLORS, packChartData } from "./telemetryUtils";

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError";
}

function SimpleMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="diagnostics-simple-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function TelemetrySimpleView({
  batteryId,
  onOpenAdvanced,
}: {
  batteryId: number;
  onOpenAdvanced: () => void;
}) {
  const { t } = useI18n();
  const [latest, setLatest] = useState<TelemetryLatest | null>(null);
  const [history, setHistory] = useState<TelemetryHistory | null>(null);
  const [latestLoading, setLatestLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [latestError, setLatestError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const latestAbort = useRef<AbortController | null>(null);
  const historyAbort = useRef<AbortController | null>(null);

  const loadLatest = useCallback(async (initial = false) => {
    latestAbort.current?.abort();
    const controller = new AbortController();
    latestAbort.current = controller;
    if (initial) setLatestLoading(true);
    try {
      const response = await api.latestTelemetry(batteryId, controller.signal);
      setLatest(response);
      setLatestError("");
    } catch (error) {
      if (!isAbort(error)) setLatestError(error instanceof ApiError ? error.detail : t("common.error"));
    } finally {
      if (latestAbort.current === controller) setLatestLoading(false);
    }
  }, [batteryId, t]);

  useEffect(() => {
    setLatest(null);
    setLatestLoading(true);
    void loadLatest(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadLatest();
    }, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadLatest();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      latestAbort.current?.abort();
    };
  }, [loadLatest]);

  useEffect(() => {
    historyAbort.current?.abort();
    const controller = new AbortController();
    historyAbort.current = controller;
    setHistory(null);
    setHistoryLoading(true);
    setHistoryError("");
    api.telemetryHistory(batteryId, "24h", { includeCells: false, signal: controller.signal })
      .then((response) => setHistory(response))
      .catch((error) => {
        if (!isAbort(error)) setHistoryError(error instanceof ApiError ? error.detail : t("common.error"));
      })
      .finally(() => {
        if (historyAbort.current === controller) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [batteryId, t]);

  const sample: TelemetrySample | null = latest?.sample ?? null;
  const connectivity = latest?.gateway?.connectivity.status ?? "unknown";
  const packData = history ? packChartData(history) : [];
  const temperatureMin = sample?.temperatures_c.length ? Math.min(...sample.temperatures_c) : null;
  const temperatureMax = sample?.temperatures_c.length ? Math.max(...sample.temperatures_c) : null;
  const lastSeen = latest?.gateway?.connectivity.last_seen_at;

  if (latestLoading && !latest) {
    return (
      <div className="diagnostics-simple" data-view-mode="simple">
        <div className="state-box" role="status"><div className="spinner" /><span>{t("telemetry.loading")}</span></div>
      </div>
    );
  }

  if (latestError) {
    return (
      <div className="diagnostics-simple" data-view-mode="simple">
        <ErrorState message={latestError} />
      </div>
    );
  }

  return (
    <div className="diagnostics-simple" data-view-mode="simple">
      <div className="diagnostics-simple-head">
        <div>
          <span className="eyebrow">{t("diagnostics.simpleKicker")}</span>
          <h3>{t("diagnostics.simpleTitle")}</h3>
          <p className="muted">{t("diagnostics.simpleSubtitle")}</p>
        </div>
        <div className="diagnostics-simple-status">
          <span className={`telemetry-status telemetry-status-${connectivity}`}>{t(`telemetry.${connectivity}`)}</span>
          <span>{t("telemetry.lastSeen")}: {lastSeen ? formatDateTime(lastSeen) : "—"}</span>
        </div>
      </div>

      {latest?.battery_classification === "demo" && sample ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.demoRealWarning")}</p></div> : null}
      {!sample && latest?.latest_any_source === "SIMULATED" ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.simulatedIncoming")}</p></div> : null}

      {sample ? (
        <>
          <div className="diagnostics-simple-metrics">
            <SimpleMetric label={t("telemetry.soc")} value={formatNumber(sample.soc_pct, "%")} />
            <SimpleMetric label={t("telemetry.soh")} value={sample.soh_pct === null ? t("telemetry.notAvailable") : formatNumber(sample.soh_pct, "%")} hint={sample.soh_pct === null ? t("passport.sohUnavailable") : undefined} />
            <SimpleMetric label={t("telemetry.packVoltage")} value={formatNumber(sample.pack_voltage_v, " V")} />
            <SimpleMetric label={t("telemetry.packCurrent")} value={formatNumber(sample.pack_current_a, " A")} />
            <SimpleMetric label={t("telemetry.remainingCapacity")} value={formatNumber(sample.capacity_remaining_ah, " Ah")} hint={`${t("telemetry.fullCapacity")}: ${formatNumber(sample.capacity_full_ah, " Ah")}`} />
            <SimpleMetric label={t("telemetry.cellDelta")} value={formatNumber(sample.cell_delta_mv, " mV")} hint={`Min ${formatNumber(sample.cell_min_mv, " mV")} · Max ${formatNumber(sample.cell_max_mv, " mV")}`} />
          </div>
          <div className="diagnostics-simple-context">
            <span><b>{t("telemetry.temperature")}</b> {formatNumber(temperatureMin, " °C")} – {formatNumber(temperatureMax, " °C")}</span>
            <span><b>{t("telemetry.gateway")}</b> {latest?.gateway?.gateway_id ?? "—"}</span>
            <span><b>{t("telemetry.source")}</b> {sample.source ?? "—"}</span>
            <span><b>{t("telemetry.lastReceivedLabel")}</b> {formatDateTime(sample.received_at)}</span>
          </div>
          {connectivity === "stale" || connectivity === "offline" ? (
            <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t(`telemetry.${connectivity}Hint`)}</p></div>
          ) : null}
        </>
      ) : (
        <EmptyState title={t("telemetry.noTelemetry")} detail={t("telemetry.noTelemetryHint")} />
      )}

      <div className="diagnostics-simple-charts">
        {historyLoading && !history ? <div className="state-box" role="status"><div className="spinner" /><span>{t("telemetry.loading")}</span></div> : null}
        {historyError ? <ErrorState message={historyError} /> : null}
        {history && packData.length ? (
          <>
            <TelemetryChart
              title={t("diagnostics.soc24h")}
              kicker={t("telemetry.range24h")}
              unit="%"
              data={packData}
              range="24h"
              series={[{ key: "soc", name: t("telemetry.soc"), color: PACK_COLORS.soc }]}
              syncId="diagnostics-simple"
              showLegend={false}
              footer={<span>{t("telemetry.points", { n: history.point_count })}</span>}
            />
            <TelemetryChart
              title={t("diagnostics.voltage24h")}
              kicker={t("telemetry.range24h")}
              unit="V"
              data={packData}
              range="24h"
              series={[{ key: "voltage", name: t("telemetry.packVoltage"), color: PACK_COLORS.voltage }]}
              syncId="diagnostics-simple"
              showLegend={false}
            />
          </>
        ) : null}
      </div>

      <div className="diagnostics-simple-footer">
        <div>
          <strong>{t("diagnostics.advancedReadOnlyTitle")}</strong>
          <p className="muted small">{t("diagnostics.advancedReadOnlyHint")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onOpenAdvanced}>
          {t("diagnostics.openAdvanced")} →
        </button>
      </div>
      <p className="diagnostics-simple-note">{t("diagnostics.permissionNote")}</p>
    </div>
  );
}
