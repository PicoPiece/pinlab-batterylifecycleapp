import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { StatCard } from "../components/StatCard";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { batteryStatusLabels, eventLabels, formatDateTime, inspectionResultLabels } from "../format";
import type { DashboardSummary } from "../types";

const PIE_COLORS = ["#0f766e", "#14b8a6", "#f59e0b", "#3b82f6", "#8b5cf6"];

export function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .dashboard()
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const statusData = data.by_status.map((item) => ({
    name: batteryStatusLabels[item.status],
    count: item.count,
  }));

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Dữ liệu trực tiếp</span>
          <h2>Tình hình pin & vòng đời</h2>
          <p className="muted">
            Số liệu lấy trực tiếp từ database. Không có KPI mô phỏng trên dashboard.
          </p>
        </div>
        <Link className="btn btn-primary" to="/batteries">
          Xem danh sách pin
        </Link>
      </div>

      <div className="stat-grid">
        <StatCard label="Tổng pin đã đăng ký" value={data.total_batteries} hint="Không gồm pin đã xóa mềm" tone="teal" />
        <StatCard label="Pin có dữ liệu SOC" value={data.soc_available} hint="Có ít nhất một lần đo" tone="blue" />
        <StatCard label="Pin có dữ liệu SOH" value={data.soh_available} hint="Không suy diễn SOH từ điện áp" tone="amber" />
        <StatCard label="Kiểm tra gần đây" value={data.recent_inspections.length} hint="5 bản ghi mới nhất" />
      </div>

      <section className="card attention-card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Cần chú ý</span>
            <h3>Pin cần kiểm định hoặc thiếu dữ liệu</h3>
          </div>
          <span className="toolbar-count">{data.needs_attention?.length ?? 0} pin</span>
        </div>
        {!data.needs_attention?.length ? (
          <EmptyState title="Không có pin cần chú ý" detail="Tất cả pin đang có SOC/SOH và inspection." />
        ) : (
          <ul className="attention-list">
            {data.needs_attention.map((item) => (
              <li key={item.battery_id}>
                <Link className="table-link" to={`/batteries/${item.battery_id}`}>
                  {item.asset_id}
                </Link>
                <div className="reason-row">
                  {item.reasons.map((reason) => (
                    <span className="reason-chip" key={reason}>{reason}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Phân bổ</span>
              <h3>Pin theo trạng thái</h3>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7eaf0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[0, 6, 6, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Chất lượng dữ liệu</span>
              <h3>Phân bổ SOC / SOH</h3>
            </div>
          </div>
          <div className="grid-2 compact">
            <div>
              <h4 className="mini-title">SOC</h4>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={data.soc_distribution} dataKey="count" nameKey="bucket" innerRadius={42} outerRadius={70} isAnimationActive={false}>
                    {data.soc_distribution.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <h4 className="mini-title">SOH</h4>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={data.soh_distribution} dataKey="count" nameKey="bucket" innerRadius={42} outerRadius={70} isAnimationActive={false}>
                    {data.soh_distribution.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Hoạt động</span>
              <h3>Kiểm tra gần đây</h3>
            </div>
          </div>
          {data.recent_inspections.length === 0 ? (
            <EmptyState title="Chưa có lần kiểm tra" detail="Ghi nhận inspection từ trang chi tiết pin." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pin</th>
                    <th>Loại kiểm tra</th>
                    <th>Kết quả</th>
                    <th>Thời điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_inspections.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/batteries/${item.battery_id}`}>{item.asset_id}</Link>
                      </td>
                      <td>{item.test_type}</td>
                      <td>
                        <span className={`result result-${item.result}`}>{inspectionResultLabels[item.result]}</span>
                      </td>
                      <td>{formatDateTime(item.inspected_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Lịch sử thay đổi</span>
              <h3>Hoạt động vòng đời gần đây</h3>
            </div>
          </div>
          {data.recent_events.length === 0 ? (
            <EmptyState title="Chưa có hoạt động" />
          ) : (
            <ul className="event-list">
              {data.recent_events.map((event) => (
                <li key={event.id}>
                  <span className={`event-marker event-${event.event_type}`} />
                  <div>
                    <strong>{eventLabels[event.event_type]}</strong>
                    <span>
                      <Link to={`/batteries/${event.battery_id}`}>{event.asset_id}</Link> · {event.actor}
                    </span>
                  </div>
                  <time>{formatDateTime(event.event_at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
