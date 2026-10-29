import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { formatNumber } from "../format";
import type { BatteryPortfolioItem } from "../types";

export function WarrantyPage() {
  const { t } = useI18n();
  const [assets, setAssets] = useState<BatteryPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .portfolio()
      .then(setAssets)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const ready = assets.filter((asset) => asset.inspection_count > 0 && asset.evidence_count > 0).length;
    const pending = assets.filter((asset) => asset.inspection_count === 0 || asset.evidence_count === 0).length;
    return { ready, pending };
  }, [assets]);

  if (loading) return <Loading label={t("common.loading")} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t("warranty.kicker")}</span>
          <h2>{t("warranty.title")}</h2>
          <p className="muted">{t("warranty.subtitle")}</p>
        </div>
        <span className="preview-badge">{t("warranty.preview")}</span>
      </div>

      <div className="warranty-banner">
        <span className="banner-icon" aria-hidden="true">i</span>
        <div>
          <strong>{t("warranty.banner")}</strong>
          <span>{t("warranty.bannerDetail")}</span>
        </div>
      </div>

      <div className="mini-kpi-row">
        <div className="mini-kpi"><span>{t("warranty.assets")}</span><strong>{assets.length}</strong><small>{t("common.demo")}</small></div>
        <div className="mini-kpi"><span>{t("warranty.evidenceReady")}</span><strong>{stats.ready}</strong><small>{t("common.evidenceAttached")}</small></div>
        <div className="mini-kpi"><span>{t("warranty.evidenceMissing")}</span><strong>{stats.pending}</strong><small>{t("common.evidencePending")}</small></div>
        <div className="mini-kpi"><span>{t("warranty.coverageConfigured")}</span><strong>0</strong><small>{t("warranty.notConfigured")}</small></div>
      </div>

      {assets.length === 0 ? (
        <EmptyState title={t("warranty.noAssets")} />
      ) : (
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">{t("warranty.preview")}</span>
              <h3>{t("warranty.title")}</h3>
            </div>
            <span className="badge badge-preview">{t("warranty.previewState")}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table warranty-table">
              <thead>
                <tr>
                  <th>{t("common.asset")}</th>
                  <th>{t("common.status")}</th>
                  <th>SOH</th>
                  <th>{t("inspections.title")}</th>
                  <th>{t("warranty.evidence")}</th>
                  <th>{t("warranty.state")}</th>
                  <th>{t("warranty.policy")}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const evidenceReady = asset.inspection_count > 0 && asset.evidence_count > 0;
                  return (
                    <tr key={asset.id}>
                      <td>
                        <Link className="table-link" to={`/batteries/${asset.id}`}>{asset.asset_id}</Link>
                        <div className="subtext">{asset.model ?? "—"}</div>
                      </td>
                      <td><StatusBadge status={asset.status} /></td>
                      <td>{asset.latest.soh ? formatNumber(asset.latest.soh.value, "%") : t("common.noData")}</td>
                      <td>{asset.inspection_count}</td>
                      <td>
                        <span className={`badge badge-${evidenceReady ? "available" : "inspecting"}`}>
                          {evidenceReady ? t("warranty.evidenceReady") : t("warranty.evidenceMissingState")}
                        </span>
                        <div className="subtext">{t("common.evidenceAttached")}: {asset.evidence_count}</div>
                      </td>
                      <td><span className="badge badge-preview">{t("warranty.previewState")}</span></td>
                      <td>{t("warranty.notConfigured")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span>{t("warranty.disclaimer")}</span>
            <Link className="text-link" to="/batteries">{t("warranty.openPassport")} →</Link>
          </div>
        </section>
      )}

      <div className="guardrail-note">
        <span aria-hidden="true">!</span>
        <div>
          <strong>{t("warranty.noDecision")}</strong>
          <p>{t("warranty.disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
