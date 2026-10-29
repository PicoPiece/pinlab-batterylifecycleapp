import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { canWrite, useAuth } from "../auth";
import { useI18n } from "../i18n";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { SpecBadge, StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatNumber } from "../format";
import type { BatteryPortfolioItem, BatteryStatus } from "../types";

const STATUSES: BatteryStatus[] = ["received", "inspecting", "tested", "available", "in_service", "second_life", "retired", "quarantined"];
const SOURCE_FILTERS = ["manual", "mock", "telemetry", "none"] as const;

export function BatteriesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<BatteryPortfolioItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [chemistry, setChemistry] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api
      .portfolio()
      .then(setItems)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const chemistries = useMemo(
    () => Array.from(new Set(items.map((item) => item.chemistry).filter((value): value is string => Boolean(value)))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (status && item.status !== status) return false;
      if (chemistry && item.chemistry !== chemistry) return false;
      const latestSource = item.latest.soh?.source ?? item.latest.soc?.source ?? null;
      const sourceGroup = latestSource === "bms_udan" || latestSource === "inverter_modbus" ? "telemetry" : latestSource ?? "none";
      if (source && sourceGroup !== source) return false;
      if (!query) return true;
      return [item.asset_id, item.serial_number, item.manufacturer, item.model, item.source, item.chemistry]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [items, search, status, chemistry, source]);

  const openAsset = (id: number) => navigate(`/batteries/${id}`);

  if (loading) return <Loading label={t("common.loading")} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t("fleet.kicker")}</span>
          <h2>{t("fleet.title")}</h2>
          <p className="muted">{t("fleet.subtitle")}</p>
        </div>
        {canWrite(user?.role) ? (
          <Link className="btn btn-primary" to="/batteries/new">+ {t("fleet.add")}</Link>
        ) : null}
      </div>

      <section className="card fleet-card">
        <div className="toolbar fleet-toolbar">
          <label className="search-field">
            <span className="sr-only">{t("common.search")}</span>
            <span aria-hidden="true">⌕</span>
            <input
              className="input"
              placeholder={t("fleet.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t("common.status")}>
            <option value="">{t("common.allStatuses")}</option>
            {STATUSES.map((value) => <option key={value} value={value}>{t(`status.${value}`)}</option>)}
          </select>
          <select className="select" value={chemistry} onChange={(event) => setChemistry(event.target.value)} aria-label="Chemistry">
            <option value="">{t("common.allChemistry")}</option>
            {chemistries.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className="select" value={source} onChange={(event) => setSource(event.target.value)} aria-label={t("common.source")}>
            <option value="">{t("common.all")} {t("common.source").toLowerCase()}</option>
            {SOURCE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value === "none" ? t("common.noData") : value === "telemetry" ? t("common.telemetry") : t(`source.${value}`)}
              </option>
            ))}
          </select>
          <span className="toolbar-count">{t("fleet.total", { n: filtered.length })}</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={search || status || chemistry || source ? t("common.noResults") : t("fleet.noAssets")}
            detail={search || status || chemistry || source ? t("common.noResultsDetail") : t("fleet.noAssetsDetail")}
          />
        ) : (
          <>
          <div className="mobile-asset-list">
            {filtered.map((item) => (
              <Link className="mobile-asset-card" key={item.id} to={`/batteries/${item.id}`}>
                <div className="mobile-asset-top">
                  <div className="mobile-asset-id">
                    <strong>{item.asset_id}</strong>
                    <span>{item.model ?? "—"} · {item.serial_number ?? "—"}</span>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mobile-asset-metrics">
                  <div className="mobile-asset-metric">
                    <span>SOC</span>
                    <strong>{item.latest.soc ? formatNumber(item.latest.soc.value, "%") : t("common.noData")}</strong>
                  </div>
                  <div className="mobile-asset-metric">
                    <span>SOH</span>
                    <strong>{item.latest.soh ? formatNumber(item.latest.soh.value, "%") : t("common.noData")}</strong>
                  </div>
                  <div className="mobile-asset-metric">
                    <span>{t("fleet.source")}</span>
                    <strong>{item.latest.soh ? t(`source.${item.latest.soh.source}`) : t("common.noData")}</strong>
                  </div>
                </div>
                <span className="mobile-asset-open">{t("mobile.openPassport")} →</span>
              </Link>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table fleet-table">
              <thead>
                <tr>
                  <th>{t("fleet.asset")}</th>
                  <th>{t("common.status")}</th>
                  <th>Chemistry</th>
                  <th>{t("fleet.capacity")}</th>
                  <th>{t("common.health")}</th>
                  <th>{t("fleet.source")}</th>
                  <th>{t("common.quality")}</th>
                  <th>{t("fleet.lastUpdate")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="clickable-row"
                    onClick={() => openAsset(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openAsset(item.id);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`${t("fleet.openPassport")}: ${item.asset_id}`}
                  >
                    <td>
                      <div className="asset-cell">
                        <span className="asset-icon" aria-hidden="true">▣</span>
                        <div>
                          <strong>{item.asset_id}</strong>
                          <span>{item.model ?? "—"} · {item.serial_number ?? "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{item.chemistry ?? "—"}<div className="subtext"><SpecBadge status={item.specification_status} /></div></td>
                    <td>{formatNumber(item.nominal_voltage_v, " V")}<div className="subtext">{formatNumber(item.nominal_capacity_ah, " Ah")}</div></td>
                    <td>
                      <div className="health-cell">
                        <div className="health-track"><i style={{ width: `${item.latest.soh?.value ?? 0}%` }} /></div>
                        <strong>{item.latest.soh ? formatNumber(item.latest.soh.value, "%") : t("common.noData")}</strong>
                      </div>
                    </td>
                    <td>
                      <span className={`source-dot source-${item.latest.soh?.source ?? "none"}`} />
                      {item.latest.soh ? t(`source.${item.latest.soh.source}`) : t("common.noData")}
                    </td>
                    <td>{item.latest.soh ? t(`quality.${item.latest.soh.quality}`) : t("common.noData")}</td>
                    <td>{formatDateTime(item.latest_measurement_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="table-foot">
          <span>{t("fleet.total", { n: filtered.length })}</span>
          <span className="provenance-inline"><span className="source-dot source-mock" />{t("dashboard.demoDisclosure", { n: filtered.length })}</span>
        </div>
      </section>
    </div>
  );
}
