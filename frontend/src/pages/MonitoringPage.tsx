import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatNumber } from "../format";
import type { BatteryPortfolioItem, Measurement, MeasurementMetric } from "../types";

const METRIC_KEYS: Array<{ key: MeasurementMetric; label: string; unit: string }> = [
  { key: "soc", label: "monitoring.soc", unit: "%" },
  { key: "soh", label: "monitoring.soh", unit: "%" },
  { key: "voltage", label: "monitoring.voltage", unit: "V" },
  { key: "current", label: "monitoring.current", unit: "A" },
  { key: "temperature", label: "monitoring.temperature", unit: "°C" },
];

export function MonitoringPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [assets, setAssets] = useState<BatteryPortfolioItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [latest, setLatest] = useState<Record<string, Measurement | null>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .portfolio()
      .then((items) => {
        setAssets(items);
        const requested = Number(searchParams.get("asset"));
        const match = items.find((item) => item.id === requested);
        if (match) setSelectedId(match.id);
        else if (items.length > 0) setSelectedId(items[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    setDetailLoading(true);
    setDetailError("");
    api
      .latestMeasurements(selectedId)
      .then((data) => active && setLatest(data))
      .catch((err) => active && setDetailError(err.message))
      .finally(() => active && setDetailLoading(false));
    return () => {
      active = false;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => assets.find((item) => item.id === selectedId) ?? null,
    [assets, selectedId],
  );

  if (loading) return <Loading label={t("common.loading")} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t("monitoring.kicker")}</span>
          <h2>{t("monitoring.title")}</h2>
          <p className="muted">{t("monitoring.subtitle")}</p>
        </div>
        <span className="preview-badge">{t("common.previewOnly")}</span>
      </div>

      <div className="monitor-banner">
        <span className="banner-icon" aria-hidden="true">⌁</span>
        <div>
          <strong>{t("monitoring.previewBanner")}</strong>
          <span>{t("monitoring.previewDetail")}</span>
        </div>
        <span className="badge badge-preview">{t("monitoring.noDevice")}</span>
      </div>

      {assets.length === 0 ? (
        <EmptyState title={t("fleet.noAssets")} detail={t("fleet.noAssetsDetail")} />
      ) : (
        <div className="monitor-layout">
          <section className="card pack-list-card">
            <div className="card-head">
              <div>
                <span className="eyebrow">{t("monitoring.packList")}</span>
                <h3>{t("monitoring.selectPack")}</h3>
              </div>
              <span className="toolbar-count">{assets.length}</span>
            </div>
            <div className="pack-list" role="listbox" aria-label={t("monitoring.packList")}>
              {assets.map((asset) => {
                const soh = asset.latest.soh?.value;
                const active = asset.id === selectedId;
                return (
                  <button
                    key={asset.id}
                    className={`pack-item ${active ? "active" : ""}`}
                    onClick={() => setSelectedId(asset.id)}
                    role="option"
                    aria-selected={active}
                  >
                    <span className="asset-icon" aria-hidden="true">▣</span>
                    <span className="pack-item-copy">
                      <strong>{asset.asset_id}</strong>
                      <small>{asset.model ?? "—"} · {asset.serial_number ?? "—"}</small>
                    </span>
                    <span className="pack-item-meta">
                      <StatusBadge status={asset.status} />
                      <small>{soh === undefined ? t("common.noData") : formatNumber(soh, "%")}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card monitor-detail-card">
            {!selected ? (
              <EmptyState title={t("monitoring.selectPack")} />
            ) : (
              <>
                <div className="detail-head">
                  <div>
                    <span className="eyebrow">{t("monitoring.detail")}</span>
                    <div className="detail-title">
                      <h2>{selected.asset_id}</h2>
                      <StatusBadge status={selected.status} />
                    </div>
                    <p className="muted">{selected.model ?? "—"} · {selected.serial_number ?? "—"}</p>
                  </div>
                  <Link className="btn btn-ghost" to={`/batteries/${selected.id}`}>
                    {t("passport.title")}
                  </Link>
                </div>

                <p className="monitor-demo-note">{t("monitoring.demoHint")}</p>

                {detailLoading ? <Loading label={t("common.loading")} /> : detailError ? <ErrorState message={detailError} /> : (
                  <div className="metric-grid">
                    {METRIC_KEYS.map((metric) => {
                      const item = latest[metric.key] ?? null;
                      return (
                        <div className="metric-card" key={metric.key}>
                          <span className="metric-label">{t(metric.label)}</span>
                          {item ? (
                            <>
                              <strong className="metric-value">{formatNumber(item.value, ` ${item.unit || metric.unit}`)}</strong>
                              <span className="metric-time">{formatDateTime(item.measured_at)}</span>
                              <div className="metric-provenance">
                                <span className={`source-dot source-${item.source}`} />
                                {t(`source.${item.source}`)}
                                <span className="quality-label">{t(`quality.${item.quality}`)}</span>
                              </div>
                            </>
                          ) : (
                            <>
                              <strong className="metric-value metric-empty">{t("monitoring.noData")}</strong>
                              <span className="metric-time">{t("monitoring.noDataHint")}</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="monitor-lower-grid">
                  <div className="connection-card">
                    <div className="card-head">
                      <div>
                        <span className="eyebrow">{t("monitoring.connection")}</span>
                        <h3>{t("common.previewOnly")}</h3>
                      </div>
                      <span className="badge badge-preview">{t("monitoring.noDevice")}</span>
                    </div>
                    <dl className="connection-list">
                      <div><dt>{t("monitoring.gateway")}</dt><dd>{t("monitoring.notAssigned")}</dd></div>
                      <div><dt>{t("monitoring.registry")}</dt><dd>{t("monitoring.notLinked")}</dd></div>
                      <div><dt>{t("monitoring.lastReceived")}</dt><dd>—</dd></div>
                      <div><dt>{t("monitoring.source")}</dt><dd>{latest.soh?.source ? t(`source.${latest.soh.source}`) : t("common.noData")}</dd></div>
                    </dl>
                  </div>
                  <div className="connection-card">
                    <div className="card-head">
                      <div>
                        <span className="eyebrow">{t("monitoring.nextGate")}</span>
                        <h3>{t("monitoring.nextGateHint")}</h3>
                      </div>
                    </div>
                    <ul className="checklist">
                      <li><span aria-hidden="true">○</span>{t("monitoring.deviceRegistry")}</li>
                      <li><span aria-hidden="true">○</span>{t("monitoring.ingest")}</li>
                      <li><span aria-hidden="true">○</span>{t("monitoring.readOnly")}</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
