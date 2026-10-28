import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { canWrite, useAuth } from "../auth";
import { StatusBadge, SpecBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { batteryStatusLabels, formatDate, formatNumber } from "../format";
import type { Battery, BatteryStatus } from "../types";

const STATUS_OPTIONS: BatteryStatus[] = [
  "received",
  "inspecting",
  "tested",
  "available",
  "in_service",
  "second_life",
  "retired",
  "quarantined",
];

export function BatteriesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Battery[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageSize = 15;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      api
        .listBatteries({ search, status: status || undefined, page, pageSize })
        .then((result) => {
          if (!active) return;
          setItems(result.items);
          setTotal(result.total);
        })
        .catch((err) => active && setError(err.message))
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, status, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Danh mục pin</span>
          <h2>Pin & tài sản</h2>
          <p className="muted">Dữ liệu chưa xác định được để trống, không tự suy diễn thông số.</p>
        </div>
        {canWrite(user?.role) ? (
          <Link className="btn btn-primary" to="/batteries/new">
            + Thêm pin
          </Link>
        ) : null}
      </div>

      <section className="card">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Tìm asset ID, serial, hãng, model…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="select"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {batteryStatusLabels[value]}
              </option>
            ))}
          </select>
          <span className="toolbar-count">{total} pin</span>
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : items.length === 0 ? (
          <EmptyState title="Chưa có pin" detail="Tạo pin đầu tiên để bắt đầu theo dõi vòng đời." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset ID</th>
                    <th>Hãng / Model</th>
                    <th>Chemistry</th>
                    <th>Điện áp</th>
                    <th>Dung lượng</th>
                    <th>Trạng thái</th>
                    <th>Spec</th>
                    <th>Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((battery) => (
                    <tr key={battery.id}>
                      <td>
                        <Link className="table-link" to={`/batteries/${battery.id}`}>
                          {battery.asset_id}
                        </Link>
                        <div className="subtext">{battery.serial_number ?? "Chưa có serial"}</div>
                      </td>
                      <td>
                        <strong>{battery.manufacturer ?? "—"}</strong>
                        <div className="subtext">{battery.model ?? "—"}</div>
                      </td>
                      <td>{battery.chemistry ?? "—"}</td>
                      <td>{formatNumber(battery.nominal_voltage_v, " V")}</td>
                      <td>{formatNumber(battery.nominal_capacity_ah, " Ah")}</td>
                      <td>
                        <StatusBadge status={battery.status} />
                      </td>
                      <td>
                        <SpecBadge status={battery.specification_status} />
                      </td>
                      <td>{formatDate(battery.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Trước
              </button>
              <span>
                Trang {page} / {pages}
              </span>
              <button className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
                Sau
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
