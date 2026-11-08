import { Suspense, lazy, useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { SpecBadge, StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { formatBytes, formatDate, formatDateTime, formatNumber } from "../format";
const TelemetryDashboard = lazy(() => import("../components/telemetry/TelemetryDashboard").then((module) => ({ default: module.TelemetryDashboard })));
import type { Attachment, Battery, Inspection, LifecycleEvent, Measurement, MeasurementMetric, TelemetryLatest } from "../types";

const METRICS: MeasurementMetric[] = ["soc", "soh", "voltage", "current", "temperature"];
const UNITS: Record<MeasurementMetric, string> = {
  soc: "%",
  soh: "%",
  voltage: "V",
  current: "A",
  temperature: "°C",
};
const TABS = ["overview", "analytics", "inspections", "lifecycle", "warranty"] as const;
type Tab = (typeof TABS)[number];

export function BatteryDetailPage() {
  const { id } = useParams();
  const batteryId = Number(id);
  const { canWrite, access } = useAuth();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const activeTab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "overview";
  const [battery, setBattery] = useState<Battery | null>(null);
  const [latest, setLatest] = useState<Record<string, Measurement | null>>({});
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [measurementError, setMeasurementError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [telemetry, setTelemetry] = useState<TelemetryLatest | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(true);
  const [telemetryError, setTelemetryError] = useState("");
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [classificationError, setClassificationError] = useState("");
  const [measurement, setMeasurement] = useState({
    metric: "soc" as MeasurementMetric,
    value: "",
    unit: "%",
    source: "manual",
    quality: "measured",
    measured_at: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!Number.isFinite(batteryId)) return;
    setError("");
    try {
      const [batteryData, latestData, measurementData, inspectionData, eventData, attachmentData] =
        await Promise.all([
          api.getBattery(batteryId),
          api.latestMeasurements(batteryId),
          api.getMeasurements(batteryId),
          api.getInspections(batteryId),
          api.getLifecycle(batteryId),
          api.getAttachments(batteryId),
        ]);
      setBattery(batteryData);
      setLatest(latestData);
      setMeasurements(measurementData.items);
      setInspections(inspectionData.items);
      setEvents(eventData.items);
      setAttachments(attachmentData);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to load battery");
    } finally {
      setLoading(false);
    }
  }, [batteryId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!Number.isFinite(batteryId)) return;
    let active = true;
    let controller: AbortController | null = null;
    const refresh = async (initial = false) => {
      controller?.abort();
      controller = new AbortController();
      if (initial) setTelemetryLoading(true);
      try {
        const data = await api.latestTelemetry(batteryId, controller.signal);
        if (active) {
          setTelemetry(data);
          setTelemetryError("");
        }
      } catch (error) {
        const aborted = typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError";
        if (active && !aborted) {
          setTelemetryError(error instanceof ApiError ? error.detail : t("common.error"));
        }
      } finally {
        if (active && initial) setTelemetryLoading(false);
      }
    };
    setTelemetry(null);
    setTelemetryLoading(true);
    void refresh(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [batteryId, t]);

  if (loading) return <Loading label={t("common.loading")} />;
  if (error) return <ErrorState message={error} />;
  if (!battery) return null;

  const writer = canWrite;
  const canClassify = Boolean(access?.is_super_admin || access?.is_manager);
  const latestSoh = latest.soh ?? null;
  const evidenceReady = inspections.length > 0 && attachments.length > 0;
  const source = latestSoh?.source ?? latest.soc?.source;
  const telemetrySample = telemetry?.sample ?? null;
  const gatewayStatus = telemetry?.gateway?.connectivity.status ?? "unknown";
  const classificationKey = battery.classification ?? "unclassified";
  const isRealPassport = battery.classification === "real";
  const isDemoPassport = battery.classification === "demo";
  const temperatureMin = telemetrySample?.temperatures_c.length ? Math.min(...telemetrySample.temperatures_c) : null;
  const temperatureMax = telemetrySample?.temperatures_c.length ? Math.max(...telemetrySample.temperatures_c) : null;
  const showManualHealth = !isRealPassport && !telemetrySample;

  const saveClassification = async (value: string) => {
    if (value !== "real" && value !== "demo") return;
    setClassificationSaving(true);
    setClassificationError("");
    try {
      const updated = await api.setBatteryClassification(battery.id, value);
      setBattery(updated);
    } catch (error) {
      setClassificationError(error instanceof ApiError ? error.detail : t("common.error"));
    } finally {
      setClassificationSaving(false);
    }
  };

  const setTab = (tab: Tab) => {
    setParams(tab === "overview" ? {} : { tab }, { replace: true });
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: Tab) => {
    const index = TABS.indexOf(tab);
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length;
    setTab(TABS[nextIndex]);
    document.getElementById(`passport-tab-${TABS[nextIndex]}`)?.focus();
  };

  const submitMeasurement = async (event: FormEvent) => {
    event.preventDefault();
    setMeasurementError("");
    const value = Number(measurement.value);
    if (!Number.isFinite(value)) {
      setMeasurementError(t("common.unknown"));
      return;
    }
    try {
      await api.createMeasurement(batteryId, {
        metric: measurement.metric,
        value,
        unit: measurement.unit,
        source: measurement.source,
        quality: measurement.quality,
        measured_at: measurement.measured_at ? new Date(measurement.measured_at).toISOString() : null,
        notes: measurement.notes.trim() || null,
      });
      setShowMeasurement(false);
      setMeasurement({ metric: "soc", value: "", unit: "%", source: "manual", quality: "measured", measured_at: "", notes: "" });
      await load();
    } catch (err) {
      setMeasurementError(err instanceof ApiError ? err.detail : "Unable to record measurement");
    }
  };

  const uploadAttachment = async (file: File | undefined) => {
    if (!file) return;
    setAttachmentError("");
    try {
      await api.uploadAttachment(batteryId, file);
      await load();
    } catch (err) {
      setAttachmentError(err instanceof ApiError ? err.detail : "Unable to upload file");
    }
  };

  return (
    <div className="stack-lg">
      <Link className="back-link" to="/batteries">← {t("passport.back")}</Link>

      <div className="detail-head">
        <div>
          <span className="eyebrow">{t("passport.kicker")}</span>
          <div className="detail-title">
            <h2>{battery.asset_id}</h2>
            <StatusBadge status={battery.status} />
            <SpecBadge status={battery.specification_status} />
            <span className={`badge badge-classification-${classificationKey}`}>{t(`classification.${classificationKey}`)}</span>
          </div>
          <p className="muted">
            {battery.model ?? "—"} · {battery.manufacturer ?? "—"} · {battery.chemistry ?? "—"}
            {source ? ` · ${t(`source.${source}`)}` : ""}
          </p>
        </div>
        <div className="button-row">
          <button className="btn btn-ghost passport-export" onClick={() => window.print()}>{t("passport.export")}</button>
          {writer ? (
            <>
              <Link className="btn btn-ghost" to={`/batteries/${battery.id}/edit`}>{t("passport.edit")}</Link>
              <Link className="btn btn-primary" to={`/batteries/${battery.id}/inspections/new`}>+ {t("passport.logInspection")}</Link>
            </>
          ) : null}
        </div>
      </div>

      {canClassify ? (
        <div className="classification-bar">
          <label className="field classification-field">
            <span>{t("passport.classification")}</span>
            <select
              className="select select-sm"
              value={battery.classification ?? ""}
              onChange={(event) => void saveClassification(event.target.value)}
              disabled={classificationSaving}
            >
              {battery.classification === null ? <option value="" disabled>{t("classification.unclassified")}</option> : null}
              <option value="real">{t("classification.realLong")}</option>
              <option value="demo">{t("classification.demoLong")}</option>
            </select>
          </label>
          {classificationSaving ? <span className="muted small">{t("common.loading")}</span> : null}
          {classificationError ? <span className="form-error">{classificationError}</span> : null}
        </div>
      ) : null}

      <div className="passport-summary-grid">
        <section className="card passport-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">{t("passport.specs")}</span>
              <h3>{t("passport.identity")}</h3>
            </div>
            <span className="toolbar-count">8 {t("common.fields")}</span>
          </div>
          <dl className="spec-grid">
            <div><dt>{t("passport.serial")}</dt><dd>{battery.serial_number ?? "—"}</dd></div>
            <div><dt>{t("passport.chemistry")}</dt><dd>{battery.chemistry ?? "—"}</dd></div>
            <div><dt>{t("passport.nominalVoltage")}</dt><dd>{formatNumber(battery.nominal_voltage_v, " V")}</dd></div>
            <div><dt>{t("passport.ratedCapacity")}</dt><dd>{formatNumber(battery.nominal_capacity_ah, " Ah")}</dd></div>
            <div><dt>{t("passport.manufacturer")}</dt><dd>{battery.manufacturer ?? "—"}</dd></div>
            <div><dt>{t("passport.commissioned")}</dt><dd>{formatDate(battery.received_at)}</dd></div>
            <div><dt>{t("passport.created")}</dt><dd>{formatDateTime(battery.created_at)}</dd></div>
            <div><dt>{t("passport.updated")}</dt><dd>{formatDateTime(battery.updated_at)}</dd></div>
          </dl>
          {isDemoPassport ? <div className="demo-banner">{t("passport.demoBanner")}</div> : null}
          {battery.classification === null ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.unclassifiedBanner")}</p></div> : null}
        </section>

        <section className="card health-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">{t("passport.health")}</span>
              <h3>{telemetrySample || isRealPassport ? t("passport.telemetryHealth") : t("passport.latestManual")}</h3>
            </div>
            {telemetrySample ? <span className="badge badge-source-bms_udan">{t("passport.realTelemetry")}</span> : null}
            {telemetrySample ? <span className={`telemetry-status telemetry-status-${gatewayStatus}`}>{t(`telemetry.${gatewayStatus}`)}</span> : null}
          </div>

          {telemetryLoading && isRealPassport ? <Loading label={t("common.loading")} /> : null}
          {telemetryError && isRealPassport ? <div className="form-error">{telemetryError}</div> : null}

          {telemetrySample ? (
            <>
              <div className="grid-2 compact">
                <div className="measure-card">
                  <span>SOC</span>
                  <strong>{formatNumber(telemetrySample.soc_pct, "%")}</strong>
                  <div className="provenance-row">
                    <span className="badge badge-source-bms_udan">{telemetrySample.source}</span>
                  </div>
                  <small>{formatDateTime(telemetrySample.measured_at)}</small>
                </div>
                <div className="measure-card">
                  <span>SOH</span>
                  <strong>{telemetrySample.soh_pct === null ? t("telemetry.notAvailable") : formatNumber(telemetrySample.soh_pct, "%")}</strong>
                  <small>{telemetrySample.soh_pct === null ? t("passport.sohUnavailable") : formatDateTime(telemetrySample.measured_at)}</small>
                </div>
              </div>
              <div className="metric-strip">
                <div className="metric-mini"><span>{t("telemetry.packVoltage")}</span><strong>{formatNumber(telemetrySample.pack_voltage_v, " V")}</strong></div>
                <div className="metric-mini"><span>{t("telemetry.packCurrent")}</span><strong>{formatNumber(telemetrySample.pack_current_a, " A")}</strong></div>
                <div className="metric-mini"><span>{t("telemetry.remainingCapacity")}</span><strong>{formatNumber(telemetrySample.capacity_remaining_ah, " Ah")} / {formatNumber(telemetrySample.capacity_full_ah, " Ah")}</strong></div>
                <div className="metric-mini"><span>{t("monitoring.temperature")}</span><strong>{formatNumber(temperatureMin, " °C")} – {formatNumber(temperatureMax, " °C")}</strong></div>
              </div>
              <div className="telemetry-health-temps" aria-label={t("monitoring.temperature")}>
                {telemetrySample.temperatures_c.map((value, index) => (
                  <span key={index}>{t("telemetry.temperatureSensor", { n: index + 1 })} <b>{formatNumber(value, " °C")}</b></span>
                ))}
              </div>
              <div className="telemetry-health-meta">
                <span><b>{t("telemetry.gateway")}</b> {telemetry?.gateway?.gateway_id ?? "—"}</span>
                <span><b>{t("telemetry.source")}</b> {telemetrySample.source}</span>
                <span><b>{t("telemetry.lastReceivedLabel")}</b> {formatDateTime(telemetrySample.received_at)}</span>
                <Link className="text-link" to={`/batteries/${battery.id}?tab=analytics`}>{t("passport.openAnalytics")} →</Link>
              </div>
              {isDemoPassport ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.demoRealWarning")}</p></div> : null}
              {!isDemoPassport && telemetry?.latest_any_source === "SIMULATED" ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.simulatedIncoming")}</p></div> : null}
            </>
          ) : isRealPassport ? (
            <div className="stack">
              <EmptyState title={t("passport.noTelemetry")} detail={t("passport.noTelemetryHint")} />
              {telemetry?.latest_any_source === "SIMULATED" ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.simulatedIncoming")}</p></div> : null}
              <Link className="btn btn-ghost" to={`/batteries/${battery.id}?tab=analytics`}>{t("passport.openAnalytics")}</Link>
            </div>
          ) : showManualHealth ? (
            <>
              <div className="grid-2 compact">
                {(["soc", "soh"] as const).map((metric) => {
                  const item = latest[metric];
                  return (
                    <div className="measure-card" key={metric}>
                      <span>{metric.toUpperCase()}</span>
                      <strong>{item ? formatNumber(item.value, item.unit) : t("passport.noMeasurement")}</strong>
                      {item ? (
                        <>
                          <div className="provenance-row">
                            <span className={`badge badge-source-${item.source}`}>{t(`source.${item.source}`)}</span>
                            <span className={`badge badge-quality-${item.quality}`}>{t(`quality.${item.quality}`)}</span>
                            {item.source === "mock" ? <span className="badge badge-simulated">{t("common.simulated")}</span> : null}
                          </div>
                          <small>{formatDateTime(item.measured_at)}</small>
                        </>
                      ) : <small>{t("passport.noMeasurementHint")}</small>}
                    </div>
                  );
                })}
              </div>
              <div className="metric-strip">
                {METRICS.filter((metric) => metric !== "soc" && metric !== "soh").map((metric) => {
                  const item = latest[metric];
                  return (
                    <div className="metric-mini" key={metric}>
                      <span>{t(`monitoring.${metric}`)}</span>
                      <strong>{item ? formatNumber(item.value, ` ${item.unit}`) : t("common.noData")}</strong>
                    </div>
                  );
                })}
              </div>
              {telemetry?.latest_any_source === "SIMULATED" ? <div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("passport.simulatedIncoming")}</p></div> : null}
            </>
          ) : null}
        </section>
      </div>

      <div className="passport-tabs" role="tablist" aria-label={t("passport.title")}>
        {TABS.map((tab) => (
          <button
            key={tab}
            id={`passport-tab-${tab}`}
            className={`passport-tab ${activeTab === tab ? "active" : ""}`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`passport-panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => setTab(tab)}
            onKeyDown={(event) => onTabKeyDown(event, tab)}
          >
            {t(`passport.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <section id="passport-panel-overview" role="tabpanel" aria-labelledby="passport-tab-overview" className="tab-panel">
          <div className="grid-2">
            <section className="card">
              <div className="card-head">
                <div><span className="eyebrow">{t("passport.manualOnly")}</span><h3>{t("passport.records", { n: measurements.length })}</h3></div>
                {writer ? <button className="btn btn-ghost" onClick={() => setShowMeasurement((value) => !value)}>{showMeasurement ? t("common.close") : `+ ${t("passport.addMeasurement")}`}</button> : null}
              </div>
              <p className="muted small">{t("passport.manualOnlyHint")}</p>
              {showMeasurement ? (
                <form className="inline-form" onSubmit={submitMeasurement}>
                  <div className="form-grid compact">
                    <label className="field"><span>{t("common.metric")}</span>
                      <select className="select" value={measurement.metric} onChange={(event) => {
                        const metric = event.target.value as MeasurementMetric;
                        setMeasurement((value) => ({ ...value, metric, unit: UNITS[metric] }));
                      }}>
                        {METRICS.map((metric) => <option key={metric} value={metric}>{t(`monitoring.${metric}`)}</option>)}
                      </select>
                    </label>
                    <label className="field"><span>{t("common.value")}</span><input className="input" type="number" step="0.001" value={measurement.value} onChange={(event) => setMeasurement((value) => ({ ...value, value: event.target.value }))} required /></label>
                    <label className="field"><span>{t("common.unit")}</span><input className="input" value={measurement.unit} onChange={(event) => setMeasurement((value) => ({ ...value, unit: event.target.value }))} required /></label>
                    <label className="field"><span>{t("common.source")}</span>
                      <select className="select" value={measurement.source} onChange={(event) => setMeasurement((value) => ({ ...value, source: event.target.value }))}>
                        <option value="manual">{t("source.manual")}</option>
                        <option value="mock">{t("source.mock")}</option>
                      </select>
                    </label>
                    <label className="field"><span>{t("common.quality")}</span>
                      <select className="select" value={measurement.quality} onChange={(event) => setMeasurement((value) => ({ ...value, quality: event.target.value }))}>
                        <option value="measured">{t("quality.measured")}</option>
                        <option value="estimated">{t("quality.estimated")}</option>
                        <option value="unknown">{t("quality.unknown")}</option>
                      </select>
                    </label>
                    <label className="field"><span>{t("common.measuredAt")}</span><input className="input" type="datetime-local" value={measurement.measured_at} onChange={(event) => setMeasurement((value) => ({ ...value, measured_at: event.target.value }))} /></label>
                  </div>
                  <label className="field"><span>{t("common.notes")}</span><input className="input" value={measurement.notes} onChange={(event) => setMeasurement((value) => ({ ...value, notes: event.target.value }))} /></label>
                  {measurementError ? <div className="form-error">{measurementError}</div> : null}
                  <div className="form-actions"><button className="btn btn-primary">{t("common.save")}</button></div>
                </form>
              ) : null}
              {measurements.length === 0 ? <EmptyState title={t("passport.noManualMeasurements")} detail={t("passport.manualOnlyHint")} /> : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>{t("common.metric")}</th><th>{t("common.value")}</th><th>{t("common.source")}</th><th>{t("common.quality")}</th><th>{t("inspections.inspectedAt")}</th></tr></thead>
                    <tbody>
                      {measurements.slice(0, 8).map((item) => (
                        <tr key={item.id}>
                          <td>{t(`monitoring.${item.metric}`)}</td>
                          <td><strong>{formatNumber(item.value, item.unit)}</strong></td>
                          <td><span className={`badge badge-source-${item.source}`}>{t(`source.${item.source}`)}</span></td>
                          <td><span className={`badge badge-quality-${item.quality}`}>{t(`quality.${item.quality}`)}</span></td>
                          <td>{formatDateTime(item.measured_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="side-stack">
              <section className="card">
                <div className="card-head"><div><span className="eyebrow">{t("passport.openActions")}</span><h3>{t("passport.openActions")}</h3></div></div>
                <ul className="action-list">
                  {!latest.soc || !latest.soh ? <li><span className="action-dot" /><div><strong>{t("attention.missing_soh")}</strong><span>{t("passport.noMeasurementHint")}</span></div></li> : null}
                  {inspections.length === 0 ? <li><span className="action-dot" /><div><strong>{t("passport.noInspection")}</strong><Link to={`/batteries/${battery.id}/inspections/new`}>{t("passport.logInspection")} →</Link></div></li> : null}
                  {attachments.length === 0 ? <li><span className="action-dot" /><div><strong>{t("passport.noEvidence")}</strong><span>{t("passport.evidenceHint")}</span></div></li> : null}
                  {latest.soc && latest.soh && inspections.length > 0 && attachments.length > 0 ? <li><span className="action-dot done" /><div><strong>{t("common.evidenceAttached")}</strong><span>{isDemoPassport ? t("passport.demoBanner") : t("passport.manualOnlyHint")}</span></div></li> : null}
                </ul>
              </section>
              <section className="card">
                <div className="card-head"><div><span className="eyebrow">{t("passport.latestInspection")}</span><h3>{t("passport.inspections")}</h3></div>{inspections.length > 0 ? <Link className="text-link" to={`/inspections/${inspections[0].id}`}>{t("common.open")} →</Link> : null}</div>
                {inspections.length === 0 ? <EmptyState title={t("passport.noInspection")} /> : (
                  <div className="inspection-preview"><span className="evidence-thumb">▤</span><div><strong>{inspections[0].test_type}</strong><span>{formatDateTime(inspections[0].inspected_at)} · {t(`result.${inspections[0].result}`)}</span><span className={`badge badge-${evidenceReady ? "available" : "inspecting"}`}>{evidenceReady ? t("common.evidenceAttached") : t("common.evidencePending")}</span></div></div>
                )}
              </section>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "inspections" ? (
        <section id="passport-panel-inspections" role="tabpanel" aria-labelledby="passport-tab-inspections" className="tab-panel">
          <div className="grid-2">
            <section className="card">
              <div className="card-head"><div><span className="eyebrow">{t("passport.inspections")}</span><h3>{t("passport.records", { n: inspections.length })}</h3></div>{writer ? <Link className="btn btn-ghost" to={`/batteries/${battery.id}/inspections/new`}>+ {t("passport.logInspection")}</Link> : null}</div>
              {inspections.length === 0 ? <EmptyState title={t("passport.noInspection")} /> : (
                <div className="table-wrap"><table className="data-table"><thead><tr><th>{t("inspections.testType")}</th><th>{t("inspections.result")}</th><th>{t("inspections.evidence")}</th><th>{t("inspections.inspectedAt")}</th></tr></thead><tbody>
                  {inspections.map((item) => {
                    const ready = attachments.length > 0;
                    return <tr key={item.id}><td><Link className="table-link" to={`/inspections/${item.id}`}>{item.test_type}</Link></td><td><span className={`result result-${item.result}`}>{t(`result.${item.result}`)}</span></td><td><span className={`badge badge-${ready ? "available" : "inspecting"}`}>{ready ? t("common.evidenceAttached") : t("common.evidencePending")}</span></td><td>{formatDateTime(item.inspected_at)}</td></tr>;
                  })}
                </tbody></table></div>
              )}
            </section>
            <section className="card">
              <div className="card-head"><div><span className="eyebrow">{t("passport.evidence")}</span><h3>{t("passport.evidence")}</h3></div>{writer ? <label className="btn btn-ghost upload-label">+ {t("passport.evidence")}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void uploadAttachment(event.target.files?.[0])} /></label> : null}</div>
              {attachmentError ? <div className="form-error">{attachmentError}</div> : null}
              {attachments.length === 0 ? <EmptyState title={t("passport.noEvidence")} detail={t("passport.evidenceHint")} /> : (
                <ul className="attachment-list">{attachments.map((item) => <li key={item.id}><div><strong>{item.filename}</strong><small>{formatBytes(item.size_bytes)} · {formatDateTime(item.created_at)}</small></div><a className="btn btn-ghost" href={api.downloadUrl(item.id)} target="_blank" rel="noreferrer">{t("common.open")}</a></li>)}</ul>
              )}
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "lifecycle" ? (
        <section id="passport-panel-lifecycle" role="tabpanel" aria-labelledby="passport-tab-lifecycle" className="tab-panel">
          <section className="card">
            <div className="card-head"><div><span className="eyebrow">{t("passport.lifecycleHistory")}</span><h3>{t("passport.records", { n: events.length })}</h3></div></div>
            {events.length === 0 ? <EmptyState title={t("dashboard.noActivity")} /> : (
              <ol className="timeline">{events.map((event) => <li key={event.id}><span className={`timeline-dot event-${event.event_type}`} /><div className="timeline-body"><div className="timeline-title"><strong>{t(`event.${event.event_type}`)}</strong><time>{formatDateTime(event.event_at)}</time></div>{event.notes ? <p>{event.notes}</p> : null}</div></li>)}</ol>
            )}
          </section>
        </section>
      ) : null}

      {activeTab === "warranty" ? (
        <section id="passport-panel-warranty" role="tabpanel" aria-labelledby="passport-tab-warranty" className="tab-panel">
          <div className="warranty-banner"><span className="banner-icon" aria-hidden="true">i</span><div><strong>{t("warranty.banner")}</strong><span>{t("warranty.bannerDetail")}</span></div><span className="badge badge-preview">{t("warranty.preview")}</span></div>
          <div className="grid-2">
            <section className="card"><div className="card-head"><div><span className="eyebrow">{t("passport.warrantyReadiness")}</span><h3>{t("warranty.previewState")}</h3></div><span className="badge badge-preview">{t("warranty.previewState")}</span></div><dl className="spec-grid"><div><dt>{t("warranty.policy")}</dt><dd>{t("warranty.notConfigured")}</dd></div><div><dt>{t("warranty.coverage")}</dt><dd>TBD</dd></div><div><dt>{t("warranty.state")}</dt><dd>{t("warranty.noDecision")}</dd></div></dl><div className="guardrail-note"><span aria-hidden="true">!</span><p>{t("warranty.disclaimer")}</p></div></section>
            <section className="card"><div className="card-head"><div><span className="eyebrow">{t("warranty.evidence")}</span><h3>{t("passport.evidence")}</h3></div></div><ul className="checklist"><li><span aria-hidden="true">{inspections.length > 0 ? "●" : "○"}</span>{t("passport.inspections")}: {inspections.length}</li><li><span aria-hidden="true">{attachments.length > 0 ? "●" : "○"}</span>{t("passport.evidence")}: {attachments.length}</li><li><span aria-hidden="true">○</span>{t("warranty.policy")}: {t("warranty.notConfigured")}</li></ul></section>
          </div>
        </section>
      ) : null}

      {activeTab === "analytics" ? (
        <section id="passport-panel-analytics" role="tabpanel" aria-labelledby="passport-tab-analytics" className="tab-panel">
          <Suspense fallback={<Loading label={t("telemetry.loading")} />}>
            <TelemetryDashboard batteryId={battery.id} />
          </Suspense>
        </section>
      ) : null}
    </div>
  );
}
