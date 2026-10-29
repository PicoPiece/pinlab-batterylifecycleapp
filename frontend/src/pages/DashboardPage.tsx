import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatNumber } from "../format";
import type { BatteryPortfolioItem, DashboardSummary } from "../types";

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "No Data" : `${formatNumber(value, "%")}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [portfolio, setPortfolio] = useState<BatteryPortfolioItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([api.dashboard(), api.portfolio()])
      .then(([summary, assets]) => {
        setData(summary);
        setPortfolio(assets);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const highCount = data?.needs_attention.filter((item) => item.severity === "high").length ?? 0;
  const reviewCount = data?.needs_attention.filter((item) => item.severity === "review").length ?? 0;

  const provenance = useMemo(() => {
    const counts = { manual: 0, mock: 0, telemetry: 0, none: 0 };
    for (const asset of portfolio) {
      const source = asset.latest.soh?.source ?? asset.latest.soc?.source;
      if (!source) counts.none += 1;
      else if (source === "manual") counts.manual += 1;
      else if (source === "mock") counts.mock += 1;
      else counts.telemetry += 1;
    }
    const total = Math.max(1, portfolio.length);
    return { ...counts, total, manualPct: Math.round((counts.manual / total) * 100), mockPct: Math.round((counts.mock / total) * 100), telemetryPct: Math.round((counts.telemetry / total) * 100), nonePct: Math.round((counts.none / total) * 100) };
  }, [portfolio]);

  if (loading) return <Loading label={t("common.loading")} />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const health = data.fleet_health;
  const attention = data.needs_attention;
  const spotlight = portfolio.slice(0, 5);

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t("dashboard.kicker")}</span>
          <h2>{t("dashboard.title", { name: user?.full_name ?? "PinLab" })}</h2>
          <p className="muted">{t("dashboard.subtitle")}</p>
        </div>
        <div className="button-row">
          <Link className="btn btn-ghost" to="/monitoring">
            {t("dashboard.openMonitoring")}
          </Link>
          <Link className="btn btn-primary" to="/batteries">
            {t("dashboard.openRegistry")}
          </Link>
        </div>
      </div>

      <div className="kpi-grid">
        <Link className="kpi-card kpi-teal" to="/batteries">
          <span className="kpi-label">{t("dashboard.assets")}</span>
          <strong className="kpi-value">{data.total_batteries}<small>{t("common.assets")}</small></strong>
          <span className="kpi-hint">{t("dashboard.assetsHint")}</span>
        </Link>
        <a className="kpi-card kpi-blue" href="#fleet-health">
          <span className="kpi-label">{t("dashboard.health")}</span>
          <strong className="kpi-value">{formatNumber(health.score, "%")}</strong>
          <span className="kpi-hint">{t("dashboard.healthHint")}</span>
        </a>
        <Link className="kpi-card kpi-amber" to="/inspections">
          <span className="kpi-label">{t("dashboard.attention")}</span>
          <strong className="kpi-value">{attention.length}<small>{t("common.items")}</small></strong>
          <span className="kpi-hint">{t("dashboard.attentionHint", { high: highCount, review: reviewCount })}</span>
        </Link>
        <Link className="kpi-card kpi-purple" to="/monitoring">
          <span className="kpi-label">{t("dashboard.coverage")}</span>
          <strong className="kpi-value">{formatNumber(health.data_coverage, "%")}</strong>
          <span className="kpi-hint">{t("dashboard.coverageHint")}</span>
        </Link>
      </div>

      <div className="dashboard-main-grid">
        <section className="card health-score-card" id="fleet-health">
          <div className="card-head">
            <div>
              <span className="eyebrow">{t("dashboard.fleetHealth")}</span>
              <h3>{t("dashboard.formula")}</h3>
            </div>
            <span className="info-pill" title={t("dashboard.formulaText")}>i</span>
          </div>
          <div className="health-score-main">
            <div>
              <strong className="health-score-value">{formatNumber(health.score, "%")}</strong>
              <span className="muted small">{t("dashboard.formulaText")}</span>
            </div>
            <div className="health-score-note">{t("dashboard.notSoh")}</div>
          </div>
          <div className="component-list">
            <div className="component-row">
              <span>{t("dashboard.weightedSoh")}</span>
              <div className="component-track"><i style={{ width: `${health.weighted_soh ?? 0}%` }} /></div>
              <strong>{percent(health.weighted_soh)}</strong>
            </div>
            <div className="component-row">
              <span>{t("dashboard.dataCoverage")}</span>
              <div className="component-track"><i style={{ width: `${health.data_coverage}%` }} /></div>
              <strong>{percent(health.data_coverage)}</strong>
            </div>
            <div className="component-row">
              <span>{t("dashboard.inspectionCurrency")}</span>
              <div className="component-track"><i style={{ width: `${health.inspection_currency}%` }} /></div>
              <strong>{percent(health.inspection_currency)}</strong>
            </div>
          </div>
        </section>

        <section className="card attention-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">{t("dashboard.needsAttention")}</span>
              <h3>{t("dashboard.needsAttentionHint")}</h3>
            </div>
            <Link className="text-link" to="/inspections">{t("dashboard.viewQueue")} →</Link>
          </div>
          {attention.length === 0 ? (
            <EmptyState title={t("dashboard.noAttention")} detail={t("dashboard.noAttentionDetail")} />
          ) : (
            <ul className="attention-list">
              {attention.map((item) => (
                <li key={item.battery_id} className={`attention-item severity-${item.severity}`}>
                  <span className="attention-severity" aria-hidden="true" />
                  <div className="attention-copy">
                    <Link className="table-link" to={`/batteries/${item.battery_id}`}>{item.asset_id}</Link>
                    <div className="reason-row">
                      {item.reasons.map((reason) => (
                        <span className="reason-chip" key={reason}>{t(`attention.${reason}`)}</span>
                      ))}
                    </div>
                  </div>
                  <span className={`badge badge-${item.severity === "high" ? "quarantined" : item.severity === "review" ? "inspecting" : "tested"}`}>
                    {item.severity === "high" ? t("common.high") : item.severity === "review" ? t("common.review") : t("common.data")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="dashboard-lower-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">{t("dashboard.assetTable")}</span>
              <h3>{t("dashboard.assetTableHint")}</h3>
            </div>
            <Link className="text-link" to="/batteries">{t("dashboard.openRegistry")} →</Link>
          </div>
          <div className="table-wrap">
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>{t("common.asset")}</th>
                  <th>{t("common.health")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.source")}</th>
                  <th>{t("common.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {spotlight.map((asset) => (
                  <tr key={asset.id}>
                    <td>
                      <Link className="table-link" to={`/batteries/${asset.id}`}>{asset.asset_id}</Link>
                      <div className="subtext">{asset.model ?? asset.serial_number ?? "—"}</div>
                    </td>
                    <td><strong>{percent(asset.latest.soh?.value)}</strong></td>
                    <td><StatusBadge status={asset.status} /></td>
                    <td>
                      <span className={`source-dot source-${asset.latest.soh?.source ?? "none"}`} />
                      {asset.latest.soh ? t(`source.${asset.latest.soh.source}`) : t("common.noData")}
                    </td>
                    <td>{formatDateTime(asset.latest_measurement_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="side-stack">
          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">{t("dashboard.provenance")}</span>
                <h3>{t("dashboard.provenanceHint")}</h3>
              </div>
            </div>
            <div className="provenance-stack" aria-label={t("dashboard.provenance")}>
              <span className="prov-manual" style={{ width: `${provenance.manualPct}%` }} />
              <span className="prov-mock" style={{ width: `${provenance.mockPct}%` }} />
              <span className="prov-telemetry" style={{ width: `${provenance.telemetryPct}%` }} />
              <span className="prov-none" style={{ width: `${provenance.nonePct}%` }} />
            </div>
            <div className="provenance-list">
              <div><span className="legend-dot prov-manual" />{t("common.manual")}<strong>{provenance.manualPct}%</strong></div>
              <div><span className="legend-dot prov-mock" />{t("common.simulated")}<strong>{provenance.mockPct}%</strong></div>
              <div><span className="legend-dot prov-telemetry" />{t("common.telemetry")}<strong>{provenance.telemetryPct}%</strong></div>
              <div><span className="legend-dot prov-none" />{t("common.noData")}<strong>{provenance.nonePct}%</strong></div>
            </div>
            <p className="provenance-note">{t("dashboard.provenanceNote")}</p>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">{t("dashboard.activity")}</span>
                <h3>{t("dashboard.activityHint")}</h3>
              </div>
            </div>
            {data.recent_events.length === 0 ? <EmptyState title={t("dashboard.noActivity")} /> : (
              <ul className="activity-list">
                {data.recent_events.slice(0, 5).map((event) => (
                  <li key={event.id}>
                    <span className={`activity-dot event-${event.event_type}`} />
                    <div>
                      <Link className="table-link" to={`/batteries/${event.battery_id}`}>{event.asset_id}</Link>
                      <span>{event.actor}</span>
                      <time>{formatDateTime(event.event_at)}</time>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="demo-disclosure">
        <span aria-hidden="true">i</span>
        {t("dashboard.demoDisclosure")}
      </div>
    </div>
  );
}
