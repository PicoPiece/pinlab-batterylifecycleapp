import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../../api";
import { formatDateTime, formatNumber } from "../../format";
import { useI18n } from "../../i18n";
import type {
  DiagnosticEvidence,
  TelemetryCellPoint,
  TelemetryConnectivityStatus,
  TelemetryHistory,
  TelemetryLatest,
  TelemetryPackPoint,
  TelemetryRange,
  TelemetrySample,
} from "../../types";
import { EmptyState, ErrorState } from "../States";
import { TelemetryChart, type SeriesSpec } from "./TelemetryCharts";
import {
  CELL_COLORS,
  PACK_COLORS,
  cellChartData,
  groupCellValues,
  packChartData,
  rangeLabelKey,
  temperatureChartData,
} from "./telemetryUtils";

type DashboardTab = "overview" | "cells" | "history";
type CellMode = "summary" | "all" | "custom";
type HistoryPanel = "pack" | "cells" | "temperature";

const RANGE_OPTIONS: TelemetryRange[] = ["1h", "24h", "7d"];

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError";
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function connectionLabelKey(status: TelemetryConnectivityStatus): string {
  return `telemetry.${status}`;
}

function ageLabel(seconds: number | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (seconds === null || seconds === undefined) return t("common.noData");
  if (seconds < 60) return t("telemetry.freshness", { n: seconds });
  if (seconds < 3600) return t("telemetry.freshness", { n: Math.floor(seconds / 60) * 60 });
  return t("telemetry.freshness", { n: Math.floor(seconds / 3600) * 3600 });
}

function latestValue(sample: TelemetrySample | null, key: keyof TelemetrySample): number | null {
  if (!sample) return null;
  const value = sample[key];
  return typeof value === "number" ? value : null;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="telemetry-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function RangeSelector({
  value,
  onChange,
  label,
}: {
  value: TelemetryRange;
  onChange: (next: TelemetryRange) => void;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div className="telemetry-range" role="group" aria-label={label}>
      {RANGE_OPTIONS.map((range) => (
        <button
          key={range}
          type="button"
          className={range === value ? "active" : ""}
          aria-pressed={range === value}
          onClick={() => onChange(range)}
        >
          {t(rangeLabelKey(range))}
        </button>
      ))}
    </div>
  );
}

function ConnectionBadge({ status }: { status: TelemetryConnectivityStatus }) {
  const { t } = useI18n();
  return <span className={`telemetry-status telemetry-status-${status}`}>{t(connectionLabelKey(status))}</span>;
}

function SummaryMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return <Metric label={label} value={value} hint={hint} />;
}

function sampleMinMax(sample: TelemetrySample | null) {
  if (!sample || sample.cell_voltages_mv.length === 0) {
    return { min: null, max: null, avg: null, minIndex: null, maxIndex: null, delta: null };
  }
  return {
    min: sample.cell_min_mv,
    max: sample.cell_max_mv,
    avg: sample.cell_avg_mv,
    minIndex: sample.cell_min_index - 1,
    maxIndex: sample.cell_max_index - 1,
    delta: sample.cell_delta_mv,
  };
}

function CellReadings({
  sample,
  selectedCell,
  onSelect,
}: {
  sample: TelemetrySample | null;
  selectedCell: number | null;
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  const stats = sampleMinMax(sample);
  if (!sample) return <EmptyState title={t("telemetry.noTelemetry")} />;
  return (
    <div className="telemetry-cell-readings">
      <div className="telemetry-cell-readings-head">
        <div>
          <span className="eyebrow">{t("telemetry.currentReadings")}</span>
          <p className="muted">{t("telemetry.clickCell")}</p>
        </div>
        <div className="telemetry-cell-legend">
          <span><i className="cell-min-dot" />{t("telemetry.lowest")}: {stats.minIndex !== null ? t("telemetry.cellNumber", { n: stats.minIndex + 1 }) : "—"}</span>
          <span><i className="cell-max-dot" />{t("telemetry.highest")}: {stats.maxIndex !== null ? t("telemetry.cellNumber", { n: stats.maxIndex + 1 }) : "—"}</span>
        </div>
      </div>
      <div className="telemetry-cell-grid">
        {sample.cell_voltages_mv.map((value, index) => {
          const isMin = index === stats.minIndex;
          const isMax = index === stats.maxIndex;
          return (
            <button
              type="button"
              key={index}
              className={`telemetry-cell-button${isMin ? " is-min" : ""}${isMax ? " is-max" : ""}${selectedCell === index ? " is-selected" : ""}`}
              onClick={() => onSelect(index)}
              aria-pressed={selectedCell === index}
            >
              <span>Cell {String(index + 1).padStart(2, "0")}</span>
              <strong>{formatNumber(value, " mV")}</strong>
              {isMin ? <small>{t("telemetry.lowest")}</small> : isMax ? <small>{t("telemetry.highest")}</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EvidencePanel({
  evidence,
  selectedCell,
  loading,
}: {
  evidence: DiagnosticEvidence | null;
  selectedCell: number | null;
  loading: boolean;
}) {
  const { t } = useI18n();
  if (loading && !evidence) {
    return <div className="telemetry-evidence-panel telemetry-evidence-loading">{t("telemetry.evidenceLoading")}</div>;
  }
  if (!evidence) return null;
  const selected = selectedCell !== null ? evidence.cells.find((item) => item.cell_index === selectedCell + 1) : null;
  const cellStat = selected?.cell_voltage;
  const selectedLabel = selectedCell !== null ? t("telemetry.cellNumber", { n: String(selectedCell + 1).padStart(2, "0") }) : t("telemetry.allCellsShort");
  const cellMins = evidence.cells.map((item) => item.cell_voltage.min).filter((value): value is number => typeof value === "number");
  const cellMaxs = evidence.cells.map((item) => item.cell_voltage.max).filter((value): value is number => typeof value === "number");
  const overallCellMin = cellMins.length ? Math.min(...cellMins) : null;
  const overallCellMax = cellMaxs.length ? Math.max(...cellMaxs) : null;
  return (
    <section className="telemetry-evidence-panel" aria-label={t("telemetry.evidence")}>
      <div className="telemetry-evidence-head">
        <div>
          <span className="eyebrow">{t("telemetry.evidence")}</span>
          <strong>{t("telemetry.evidenceRange", { range: t(rangeLabelKey(evidence.range)) })}</strong>
        </div>
        <span className="telemetry-evidence-source">{evidence.provenance.source ?? "—"} · {t("telemetry.samples", { n: evidence.sample_count })}</span>
      </div>
      <div className="telemetry-evidence-grid">
        {cellStat ? (
          <>
            <div><span>{selectedLabel} · {t("telemetry.min")}</span><b>{formatNumber(cellStat.min, " mV")}</b></div>
            <div><span>{selectedLabel} · {t("telemetry.max")}</span><b>{formatNumber(cellStat.max, " mV")}</b></div>
            <div><span>{selectedLabel} · {t("telemetry.avg")}</span><b>{formatNumber(cellStat.avg, " mV")}</b></div>
          </>
        ) : (
          <>
            <div><span>{t("telemetry.cellMin")}</span><b>{formatNumber(overallCellMin, " mV")}</b></div>
            <div><span>{t("telemetry.cellMax")}</span><b>{formatNumber(overallCellMax, " mV")}</b></div>
            <div><span>{t("telemetry.cellDelta")}</span><b>{formatNumber(evidence.cell_delta.max, " mV")}</b></div>
          </>
        )}
        <div><span>{t("telemetry.peakCurrent")}</span><b>{formatNumber(evidence.pack.peak_abs_current_a, " A")}</b></div>
        <div><span>{t("telemetry.temperatureRange")}</span><b>{formatNumber(evidence.pack.temperature_min_c, " °C")} – {formatNumber(evidence.pack.temperature_max_c, " °C")}</b></div>
        <div><span>{t("telemetry.completeness")}</span><b>{formatNumber(evidence.data_completeness_pct, "%")}</b></div>
        <div><span>{t("telemetry.gaps")}</span><b>{evidence.measurement_gaps.length}</b></div>
      </div>
      <p className="telemetry-evidence-hint">{t("telemetry.evidenceHint", { range: t(rangeLabelKey(evidence.range)), samples: evidence.sample_count, source: evidence.provenance.source ?? "—" })}</p>
    </section>
  );
}

function CellControls({
  mode,
  setMode,
  selectedCell,
  setSelectedCell,
  visibleCells,
  setVisibleCells,
  minMaxVisible,
  setMinMaxVisible,
  relativeMode,
  setRelativeMode,
  mobile,
  pickerOpen,
  setPickerOpen,
}: {
  mode: CellMode;
  setMode: (mode: CellMode) => void;
  selectedCell: number | null;
  setSelectedCell: (index: number | null) => void;
  visibleCells: Set<number>;
  setVisibleCells: (cells: Set<number>) => void;
  minMaxVisible: boolean;
  setMinMaxVisible: (visible: boolean) => void;
  relativeMode: boolean;
  setRelativeMode: (relative: boolean) => void;
  mobile: boolean;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const toggleCell = (index: number) => {
    const next = new Set(visibleCells);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setVisibleCells(next);
  };
  return (
    <div className="telemetry-cell-controls">
      <div className="telemetry-segment" role="group" aria-label={t("telemetry.cellSelector")}>
        <button type="button" className={mode === "summary" ? "active" : ""} onClick={() => setMode("summary")}>{t("telemetry.summary")}</button>
        <button type="button" className={mode === "all" ? "active" : ""} onClick={() => { setMode("all"); setVisibleCells(new Set(Array.from({ length: 16 }, (_, index) => index))); }}>{t("telemetry.allCells")}</button>
        <button type="button" className={mode === "custom" ? "active" : ""} onClick={() => setMode("custom")}>{t("telemetry.custom")}</button>
      </div>
      <button type="button" className={`telemetry-toggle${minMaxVisible ? " active" : ""}`} aria-pressed={minMaxVisible} onClick={() => setMinMaxVisible(!minMaxVisible)}>
        {t("telemetry.minMax")}
      </button>
      {mode !== "summary" ? (
        <button type="button" className={`telemetry-toggle${relativeMode ? " active" : ""}`} aria-pressed={relativeMode} onClick={() => setRelativeMode(!relativeMode)}>
          {t("telemetry.relativeMode")}
        </button>
      ) : null}
      {mode !== "summary" && mobile ? (
        <button type="button" className="telemetry-toggle telemetry-cell-picker-toggle" aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)}>
          {t("telemetry.selectCellsToggle", { n: visibleCells.size })}
        </button>
      ) : null}
      {mode !== "summary" && (!mobile || pickerOpen) ? (
        <div className="telemetry-cell-checkboxes">
          <button type="button" className="telemetry-text-button" onClick={() => setVisibleCells(new Set(Array.from({ length: 16 }, (_, index) => index)))}>{t("telemetry.showAll")}</button>
          <button type="button" className="telemetry-text-button" onClick={() => setVisibleCells(new Set())}>{t("telemetry.hideAll")}</button>
          {Array.from({ length: 16 }, (_, index) => (
            <label key={index} className={`telemetry-cell-check${selectedCell === index ? " selected" : ""}`}>
              <input type="checkbox" checked={visibleCells.has(index)} onChange={() => { setSelectedCell(index); toggleCell(index); }} />
              <i style={{ background: CELL_COLORS[index] }} />
              {t("telemetry.cell", { n: String(index + 1).padStart(2, "0") })}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TelemetryDashboard({ batteryId }: { batteryId: number }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [range, setRange] = useState<TelemetryRange>("1h");
  const [latest, setLatest] = useState<TelemetryLatest | null>(null);
  const [history, setHistory] = useState<TelemetryHistory | null>(null);
  const [cellHistory, setCellHistory] = useState<TelemetryHistory | null>(null);
  const [latestLoading, setLatestLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [cellLoading, setCellLoading] = useState(false);
  const [evidence, setEvidence] = useState<DiagnosticEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [latestError, setLatestError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [cellError, setCellError] = useState("");
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [cellMode, setCellMode] = useState<CellMode>("summary");
  const [visibleCells, setVisibleCells] = useState<Set<number>>(new Set(Array.from({ length: 16 }, (_, index) => index)));
  const [minMaxVisible, setMinMaxVisible] = useState(true);
  const [relativeMode, setRelativeMode] = useState(false);
  const [cellPickerOpen, setCellPickerOpen] = useState(false);
  const [mobileOverviewChart, setMobileOverviewChart] = useState<"soc" | "voltage" | "current" | "delta">("soc");
  const isMobile = useMediaQuery("(max-width: 640px)");
  const [historyPanel, setHistoryPanel] = useState<HistoryPanel>("pack");
  const latestAbort = useRef<AbortController | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const cellAbort = useRef<AbortController | null>(null);
  const cellCacheKey = useRef<string | null>(null);
  const evidenceAbort = useRef<AbortController | null>(null);
  const evidenceCacheKey = useRef<string | null>(null);

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
    setHistory(null);
    setCellHistory(null);
    setEvidence(null);
    cellCacheKey.current = null;
    evidenceCacheKey.current = null;
    setHistoryLoading(true);
    setHistoryError("");
    const controller = new AbortController();
    historyAbort.current = controller;
    api.telemetryHistory(batteryId, range, { includeCells: false, signal: controller.signal })
      .then((response) => setHistory(response))
      .catch((error) => {
        if (!isAbort(error)) setHistoryError(error instanceof ApiError ? error.detail : t("common.error"));
      })
      .finally(() => {
        if (historyAbort.current === controller) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [batteryId, range, t]);

  const needCells = (tab === "cells" && cellMode !== "summary") || (tab === "history" && historyPanel === "cells");

  useEffect(() => {
    if (!needCells) {
      setCellLoading(false);
      return;
    }
    const cacheKey = `${batteryId}:${range}`;
    if (cellHistory && cellCacheKey.current === cacheKey) return;
    cellAbort.current?.abort();
    const controller = new AbortController();
    cellAbort.current = controller;
    setCellLoading(true);
    setCellError("");
    api.telemetryHistory(batteryId, range, { includeCells: true, signal: controller.signal })
      .then((response) => {
        setCellHistory(response);
        cellCacheKey.current = cacheKey;
      })
      .catch((error) => {
        if (!isAbort(error)) setCellError(error instanceof ApiError ? error.detail : t("common.error"));
      })
      .finally(() => {
        if (cellAbort.current === controller) setCellLoading(false);
      });
    return () => controller.abort();
  }, [batteryId, range, needCells, cellHistory, t]);

  const needEvidence = tab === "cells" || tab === "history";

  useEffect(() => {
    if (!needEvidence) {
      setEvidenceLoading(false);
      return;
    }
    const cacheKey = `${batteryId}:${range}`;
    if (evidence && evidenceCacheKey.current === cacheKey) return;
    evidenceAbort.current?.abort();
    const controller = new AbortController();
    evidenceAbort.current = controller;
    setEvidenceLoading(true);
    api.telemetryEvidence(batteryId, range, controller.signal)
      .then((response) => {
        setEvidence(response);
        evidenceCacheKey.current = cacheKey;
      })
      .catch(() => {
        // Evidence is an enhancement; charts remain usable if this request fails.
      })
      .finally(() => {
        if (evidenceAbort.current === controller) setEvidenceLoading(false);
      });
    return () => controller.abort();
  }, [batteryId, range, needEvidence, evidence]);

  const sample = latest?.sample ?? null;
  const connectivity = latest?.gateway?.connectivity.status ?? "unknown";
  const stats = sampleMinMax(sample);
  const packData = useMemo(() => history ? packChartData(history) : [], [history]);
  const cellData = useMemo(() => cellHistory ? cellChartData(cellHistory) : [], [cellHistory]);
  const temperatureData = useMemo(() => history ? temperatureChartData(history) : [], [history]);
  const pointLabel = history ? t("telemetry.points", { n: history.point_count }) : "";
  const bucketLabel = history && history.bucket_seconds > 0 ? t("telemetry.bucket", { n: history.bucket_seconds }) : "";

  const summarySeries: SeriesSpec[] = [
    { key: "cellMin", name: t("telemetry.min"), color: PACK_COLORS.cellMin },
    { key: "cellMax", name: t("telemetry.max"), color: PACK_COLORS.cellMax },
    { key: "cellAvg", name: t("telemetry.avg"), color: PACK_COLORS.cellAvg },
  ].filter((item) => minMaxVisible || item.key === "cellAvg");

  const cellKeys = useMemo(
    () => Array.from({ length: 16 }, (_, index) => index).filter((index) => cellMode === "all" || visibleCells.has(index)),
    [cellMode, visibleCells],
  );

  const cellSeries: SeriesSpec[] = useMemo(() => {
    const visible = Array.from({ length: 16 }, (_, index) => index)
      .filter((index) => cellMode === "all" || visibleCells.has(index));
    const keyFor = (index: number) => `${relativeMode ? "r" : "c"}${index + 1}`;
    const base: SeriesSpec[] = visible.map((index) => ({
      key: keyFor(index),
      name: t("telemetry.cell", { n: String(index + 1).padStart(2, "0") }),
      color: CELL_COLORS[index],
      width: selectedCell === index ? 3.2 : 1.2,
      opacity: selectedCell === null || selectedCell === index ? 1 : 0.22,
    }));
    const highlighted = selectedCell !== null ? base.find((_, index) => visible[index] === selectedCell) : undefined;
    const others = base.filter((_, index) => visible[index] !== selectedCell);
    const selectedVisible = selectedCell !== null && visible.includes(selectedCell);
    const extrema: SeriesSpec[] = selectedVisible && minMaxVisible && !relativeMode
      ? [
          { key: `min${selectedCell + 1}`, name: `${t("telemetry.min")} C${selectedCell + 1}`, color: "#64748b", dashed: true, width: 1.2, opacity: 0.62 },
          { key: `max${selectedCell + 1}`, name: `${t("telemetry.max")} C${selectedCell + 1}`, color: "#7c3aed", dashed: true, width: 1.2, opacity: 0.62 },
        ]
      : [];
    // Recharts renders the children in reverse paint order; the selected
    // series is placed first in the data order so it is painted last/on top.
    return highlighted ? [highlighted, ...extrema, ...others] : base;
  }, [cellMode, minMaxVisible, relativeMode, selectedCell, t, visibleCells]);

  const temperatureSeries: SeriesSpec[] = Array.from({ length: 5 }, (_, index) => ({
    key: `t${index + 1}`,
    name: t("telemetry.temperatureSensor", { n: index + 1 }),
    color: ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be123c"][index],
  }));

  const selectCell = (index: number) => {
    setSelectedCell(index);
    if (cellMode === "summary") setCellMode("all");
    setVisibleCells((current) => {
      const next = new Set(current);
      next.add(index);
      return next;
    });
  };

  const renderLatestError = latestError ? <ErrorState message={latestError} /> : null;
  const renderHistoryError = historyError ? <ErrorState message={historyError} /> : null;
  const renderCellError = cellError ? <ErrorState message={cellError} /> : null;

  if (latestLoading && !latest) return <div className="telemetry-panel"><div className="state-box" role="status"><div className="spinner" /><span>{t("telemetry.loading")}</span></div></div>;
  if (renderLatestError) return <div className="telemetry-panel">{renderLatestError}</div>;

  return (
    <div className="telemetry-panel">
      <div className="telemetry-head">
        <div>
          <span className="eyebrow">{t("telemetry.kicker")}</span>
          <h2>{t("telemetry.title")}</h2>
          <p className="muted">{t("telemetry.subtitle")}</p>
        </div>
        <div className="telemetry-head-side">
          <ConnectionBadge status={connectivity} />
          <span className="telemetry-last-seen">
            {t("telemetry.lastSeen")}: {latest?.gateway?.connectivity.last_seen_at ? formatDateTime(latest.gateway.connectivity.last_seen_at) : "—"}
          </span>
        </div>
      </div>

      <div className="telemetry-toolbar">
        <div className="telemetry-segment telemetry-primary-tabs" role="tablist" aria-label={t("telemetry.title")}>
          {(["overview", "cells", "history"] as DashboardTab[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
              {t(`telemetry.${item === "cells" ? "cellAnalysis" : item}`)}
            </button>
          ))}
        </div>
        <RangeSelector value={range} onChange={setRange} label={t("telemetry.window")} />
      </div>

      <div className="telemetry-summary-strip">
        <SummaryMetric label={t("telemetry.soc")} value={sample ? formatNumber(sample.soc_pct, "%") : t("telemetry.notAvailable")} />
        <SummaryMetric label={t("telemetry.packVoltage")} value={sample ? formatNumber(sample.pack_voltage_v, " V") : "—"} />
        <SummaryMetric label={t("telemetry.packCurrent")} value={sample ? formatNumber(sample.pack_current_a, " A") : "—"} />
        <SummaryMetric label={t("telemetry.remainingCapacity")} value={sample ? formatNumber(sample.capacity_remaining_ah, " Ah") : "—"} hint={sample ? `${t("telemetry.fullCapacity")}: ${formatNumber(sample.capacity_full_ah, " Ah")}` : undefined} />
        <SummaryMetric label={t("telemetry.cellDelta")} value={sample ? formatNumber(sample.cell_delta_mv, " mV") : "—"} hint={sample ? `Min ${formatNumber(sample.cell_min_mv, " mV")} · Max ${formatNumber(sample.cell_max_mv, " mV")}` : undefined} />
        <SummaryMetric label={t("telemetry.soh")} value={sample?.soh_pct !== null && sample?.soh_pct !== undefined ? formatNumber(sample.soh_pct, "%") : t("telemetry.notAvailable")} />
      </div>

      <div className="telemetry-context-row">
        <span><b>{t("telemetry.gateway")}</b> {latest?.gateway?.gateway_id ?? t("telemetry.noGateway")}</span>
        <span><b>{t("telemetry.slot")}</b> {latest?.gateway ? latest.gateway.battery_slot : "—"}</span>
        <span><b>{t("telemetry.source")}</b> {sample?.source ?? "—"}</span>
        <span><b>{t("telemetry.protocol")}</b> {sample?.protocol ?? "—"}</span>
        <span><b>{t("telemetry.lastTelemetry")}</b> {sample ? formatDateTime(sample.measured_at) : "—"}</span>
        {connectivity === "stale" || connectivity === "offline" ? <span className="telemetry-stale-note">{t(`telemetry.${connectivity}Hint`)}</span> : null}
      </div>

      {latest?.battery_classification === "demo" && sample ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.demoRealWarning")}</p></div> : null}
      {!sample && latest?.latest_any_source === "SIMULATED" ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.simulatedIncoming")}</p></div> : null}

      {tab === "overview" ? (
        <section className="telemetry-tab-panel" role="tabpanel">
          {!sample ? <EmptyState title={t("telemetry.noTelemetry")} detail={t("telemetry.noTelemetryHint")} /> : null}
          {historyLoading && !history ? <div className="state-box" role="status"><div className="spinner" /><span>{t("telemetry.loading")}</span></div> : null}
          {renderHistoryError}
          {history ? (
            <>
              {isMobile ? (
                <div className="telemetry-mobile-chart-tabs" role="tablist" aria-label={t("telemetry.overview")}>
                  {(["soc", "voltage", "current", "delta"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={mobileOverviewChart === key}
                      className={mobileOverviewChart === key ? "active" : ""}
                      onClick={() => setMobileOverviewChart(key)}
                    >
                      {key === "soc" ? t("telemetry.soc") : key === "voltage" ? t("telemetry.packVoltage") : key === "current" ? t("telemetry.packCurrent") : t("telemetry.cellDelta")}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="telemetry-chart-grid">
                {[
                  {
                    key: "soc" as const,
                    chart: <TelemetryChart title={t("telemetry.socHistory")} unit="%" data={packData} range={range} series={[{ key: "soc", name: t("telemetry.soc"), color: PACK_COLORS.soc }]} syncId="telemetry-overview" brush footer={<span>{pointLabel}{bucketLabel ? ` · ${bucketLabel}` : ""}</span>} showLegend={false} />,
                  },
                  {
                    key: "voltage" as const,
                    chart: <TelemetryChart title={t("telemetry.voltageHistory")} unit="V" data={packData} range={range} series={[{ key: "voltage", name: t("telemetry.packVoltage"), color: PACK_COLORS.voltage }]} syncId="telemetry-overview" brush showLegend={false} />,
                  },
                  {
                    key: "current" as const,
                    chart: <TelemetryChart title={t("telemetry.currentHistory")} unit="A" data={packData} range={range} series={[{ key: "current", name: t("telemetry.packCurrent"), color: PACK_COLORS.current }]} syncId="telemetry-overview" brush showLegend={false} />,
                  },
                  {
                    key: "delta" as const,
                    chart: <TelemetryChart title={t("telemetry.deltaHistory")} unit="mV" data={packData} range={range} series={[{ key: "delta", name: t("telemetry.cellDelta"), color: PACK_COLORS.delta }]} syncId="telemetry-overview" brush footer={<span>{t("telemetry.hint")}</span>} showLegend={false} />,
                  },
                ].filter((item) => !isMobile || item.key === mobileOverviewChart).map((item) => (
                  <div className="telemetry-mobile-chart" key={item.key}>{item.chart}</div>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "cells" ? (
        <section className="telemetry-tab-panel" role="tabpanel">
          <div className="telemetry-cell-top">
            <div className="telemetry-cell-summary">
              <Metric label={t("telemetry.cellMin")} value={stats.min !== null ? `${t("telemetry.cellNumber", { n: (stats.minIndex ?? 0) + 1 })} · ${formatNumber(stats.min, " mV")}` : "—"} />
              <Metric label={t("telemetry.cellMax")} value={stats.max !== null ? `${t("telemetry.cellNumber", { n: (stats.maxIndex ?? 0) + 1 })} · ${formatNumber(stats.max, " mV")}` : "—"} />
              <Metric label={t("telemetry.cellAvg")} value={stats.avg !== null ? formatNumber(stats.avg, " mV") : "—"} />
              <Metric label={t("telemetry.cellDelta")} value={stats.delta !== null ? formatNumber(stats.delta, " mV") : "—"} />
            </div>
            <CellControls
              mode={cellMode}
              setMode={setCellMode}
              selectedCell={selectedCell}
              setSelectedCell={setSelectedCell}
              visibleCells={visibleCells}
              setVisibleCells={setVisibleCells}
              minMaxVisible={minMaxVisible}
              setMinMaxVisible={setMinMaxVisible}
              relativeMode={relativeMode}
              setRelativeMode={setRelativeMode}
              mobile={isMobile}
              pickerOpen={cellPickerOpen}
              setPickerOpen={setCellPickerOpen}
            />
          </div>
          {cellMode !== "summary" && sample ? (
            <p className="telemetry-overlap-note">
              {t("telemetry.overlapExplanation", {
                levels: groupCellValues(sample.cell_voltages_mv).length,
                total: sample.cell_voltages_mv.length,
              })}
            </p>
          ) : null}
          <EvidencePanel evidence={evidence} selectedCell={selectedCell} loading={evidenceLoading} />
          <div className="telemetry-cell-charts">
            {cellMode === "summary" || cellHistory ? (
              <TelemetryChart
                title={t("telemetry.cellHistory")}
                kicker={cellMode === "summary" ? t("telemetry.summary") : t("telemetry.cellSelector")}
                unit="mV"
                data={cellMode === "summary" ? packData : cellData}
                range={range}
                series={cellMode === "summary" ? summarySeries : cellSeries}
                syncId="telemetry-cells"
                brush
                height={310}
                cellTooltip={cellMode !== "summary"}
                selectedCell={selectedCell}
                cellKeys={cellKeys}
                relativeMode={relativeMode}
                footer={<span>{relativeMode ? t("telemetry.relativeHint") : t("telemetry.hint")}</span>}
                showLegend={cellMode === "summary"}
              />
            ) : null}
            {cellMode !== "summary" && cellLoading && !cellHistory ? <div className="state-box" role="status"><div className="spinner" /><span>{t("telemetry.loading")}</span></div> : null}
            {renderCellError}
            <TelemetryChart
              title={t("telemetry.deltaHistory")}
              unit="mV"
              data={packData}
              range={range}
              series={[{ key: "delta", name: t("telemetry.cellDelta"), color: PACK_COLORS.delta }]}
              syncId="telemetry-cells"
              brush
              footer={<span>{t("telemetry.hint")}</span>}
              showLegend={false}
            />
            <CellReadings sample={sample} selectedCell={selectedCell} onSelect={selectCell} />
          </div>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="telemetry-tab-panel" role="tabpanel">
          <div className="telemetry-segment telemetry-history-tabs" role="tablist" aria-label={t("telemetry.history")}>
            {(["pack", "cells", "temperature"] as HistoryPanel[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={historyPanel === item} className={historyPanel === item ? "active" : ""} onClick={() => setHistoryPanel(item)}>
                {item === "pack" ? t("telemetry.packPower") : item === "cells" ? t("telemetry.cellAnalysis") : t("telemetry.temperature")}
              </button>
            ))}
          </div>
          <EvidencePanel evidence={evidence} selectedCell={selectedCell} loading={evidenceLoading} />
          {historyLoading && !history ? <div className="state-box" role="status"><div className="spinner" /><span>{t("telemetry.loading")}</span></div> : null}
          {renderHistoryError}
          {history ? (
            <>
              {historyPanel === "pack" ? (
                <div className="telemetry-chart-grid">
                  <TelemetryChart title={t("telemetry.socHistory")} unit="%" data={packData} range={range} series={[{ key: "soc", name: t("telemetry.soc"), color: PACK_COLORS.soc }]} syncId="history-pack" brush showLegend={false} />
                  <TelemetryChart title={t("telemetry.voltageHistory")} unit="V" data={packData} range={range} series={[{ key: "voltage", name: t("telemetry.packVoltage"), color: PACK_COLORS.voltage }]} syncId="history-pack" brush showLegend={false} />
                  <TelemetryChart title={t("telemetry.currentHistory")} unit="A" data={packData} range={range} series={[{ key: "current", name: t("telemetry.packCurrent"), color: PACK_COLORS.current }]} syncId="history-pack" brush showLegend={false} />
                </div>
              ) : null}
              {historyPanel === "cells" ? (
                <>
                  {cellLoading && !cellHistory ? <div className="state-box" role="status"><div className="spinner" /><span>{t("telemetry.loading")}</span></div> : null}
                  {renderCellError}
                  <div className="telemetry-history-cell-select">
                    <label className="field">
                      <span>{t("telemetry.selectedCell")}</span>
                      <select
                        className="select select-sm"
                        value={selectedCell ?? 0}
                        onChange={(event) => setSelectedCell(Number(event.target.value))}
                      >
                        {Array.from({ length: 16 }, (_, index) => (
                          <option key={index} value={index}>{t("telemetry.cell", { n: String(index + 1).padStart(2, "0") })}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="telemetry-chart-grid">
                    <TelemetryChart title={t("telemetry.deltaHistory")} unit="mV" data={packData} range={range} series={[{ key: "delta", name: t("telemetry.cellDelta"), color: PACK_COLORS.delta }]} syncId="history-cells" brush footer={<span>{t("telemetry.hint")}</span>} showLegend={false} />
                    {cellHistory ? (
                      <TelemetryChart
                        title={t("telemetry.cellHistory")}
                        unit="mV"
                        data={cellData}
                        range={range}
                        series={selectedCell !== null
                          ? [{ key: `c${selectedCell + 1}`, name: t("telemetry.cell", { n: selectedCell + 1 }), color: CELL_COLORS[selectedCell] }]
                          : [{ key: "c1", name: t("telemetry.cell", { n: 1 }), color: CELL_COLORS[0] }]}
                        syncId="history-cells"
                        brush
                        cellTooltip
                        selectedCell={selectedCell}
                        cellKeys={selectedCell !== null ? [selectedCell] : [0]}
                        footer={<span>{t("telemetry.clickCell")}</span>}
                        showLegend={false}
                      />
                    ) : null}
                  </div>
                </>
              ) : null}
              {historyPanel === "temperature" ? (
                <TelemetryChart title={t("telemetry.temperatureHistory")} unit="°C" data={temperatureData} range={range} series={temperatureSeries} syncId="history-temperature" brush height={300} />
              ) : null}
            </>
          ) : null}
          {!historyLoading && history && history.point_count === 0 ? <EmptyState title={t("telemetry.noHistory")} /> : null}
        </section>
      ) : null}
    </div>
  );
}
