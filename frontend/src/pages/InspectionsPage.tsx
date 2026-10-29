import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { formatDateTime } from "../format";
import type { BatteryPortfolioItem, InspectionSummary } from "../types";

export function InspectionsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<InspectionSummary[]>([]);
  const [assets, setAssets] = useState<BatteryPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    Promise.all([api.listInspections(), api.portfolio()])
      .then(([inspections, portfolio]) => {
        setItems(inspections.items);
        setAssets(portfolio);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.asset_id, item.test_type, item.technician, item.result].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [items, search]);

  const stats = useMemo(() => {
    const attached = items.filter((item) => item.evidence_count > 0).length;
    return { total: items.length, attached, pending: items.length - attached };
  }, [items]);

  if (loading) return <Loading label={t("common.loading")} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t("inspections.kicker")}</span>
          <h2>{t("inspections.title")}</h2>
          <p className="muted">{t("inspections.subtitle")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowPicker((value) => !value)} aria-expanded={showPicker}>
          + {t("inspections.new")}
        </button>
      </div>

      {showPicker ? (
        <section className="card asset-picker" aria-label={t("inspections.selectAsset")}>
          <div className="card-head">
            <div>
              <span className="eyebrow">{t("inspections.selectAsset")}</span>
              <h3>{t("inspections.selectAssetHint")}</h3>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPicker(false)}>{t("common.close")}</button>
          </div>
          {assets.length === 0 ? <EmptyState title={t("inspections.noAssets")} /> : (
            <div className="asset-picker-grid">
              {assets.map((asset) => (
                <button
                  className="asset-pick"
                  key={asset.id}
                  onClick={() => navigate(`/batteries/${asset.id}/inspections/new`)}
                >
                  <span className="asset-icon" aria-hidden="true">▣</span>
                  <span><strong>{asset.asset_id}</strong><small>{asset.model ?? "—"} · {asset.serial_number ?? "—"}</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <div className="mini-kpi-row">
        <div className="mini-kpi"><span>{t("inspections.queue")}</span><strong>{stats.total}</strong><small>{t("inspections.queueHint")}</small></div>
        <div className="mini-kpi"><span>{t("common.evidenceAttached")}</span><strong>{stats.attached}</strong><small>{t("inspections.evidence")}</small></div>
        <div className="mini-kpi"><span>{t("common.evidencePending")}</span><strong>{stats.pending}</strong><small>{t("common.evidencePending")}</small></div>
        <div className="mini-kpi"><span>{t("dashboard.assets")}</span><strong>{assets.length}</strong><small>{t("common.demo")}</small></div>
      </div>

      <section className="card">
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">{t("common.search")}</span>
            <span aria-hidden="true">⌕</span>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("inspections.searchPlaceholder")} />
          </label>
          <span className="toolbar-count">{filtered.length} / {items.length}</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title={t("inspections.noInspections")} detail={t("inspections.noInspectionsDetail")} />
        ) : (
          <div className="table-wrap">
            <table className="data-table inspection-table">
              <thead>
                <tr>
                  <th>{t("inspections.asset")}</th>
                  <th>{t("inspections.testType")}</th>
                  <th>{t("inspections.result")}</th>
                  <th>{t("inspections.technician")}</th>
                  <th>{t("inspections.evidence")}</th>
                  <th>{t("inspections.inspectedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="clickable-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`${t("inspections.detail")}: ${item.asset_id}`}
                    onClick={() => navigate(`/inspections/${item.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/inspections/${item.id}`);
                      }
                    }}
                  >
                    <td><Link className="table-link" to={`/batteries/${item.battery_id}`}>{item.asset_id}</Link></td>
                    <td>{item.test_type}<div className="subtext">{item.notes?.startsWith("DEMO") ? t("inspections.demoRecord") : ""}</div></td>
                    <td><span className={`result result-${item.result}`}>{t(`result.${item.result}`)}</span></td>
                    <td>{item.technician}</td>
                    <td>
                      <span className={`badge badge-${item.evidence_count > 0 ? "available" : "inspecting"}`}>
                        {item.evidence_count > 0 ? t("common.evidenceAttached") : t("common.evidencePending")}
                      </span>
                      <div className="subtext">{item.evidence_count} {t("common.files")}</div>
                    </td>
                    <td>{formatDateTime(item.inspected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
