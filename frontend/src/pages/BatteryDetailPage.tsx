import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { canWrite, useAuth } from "../auth";
import { SpecBadge, StatusBadge } from "../components/StatusBadge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import {
  eventLabels,
  formatBytes,
  formatDate,
  formatDateTime,
  formatNumber,
  inspectionResultLabels,
  metricLabels,
  qualityLabels,
  sourceLabels,
} from "../format";
import type { Attachment, Battery, Inspection, LifecycleEvent, Measurement, MeasurementMetric } from "../types";

const metrics: MeasurementMetric[] = ["soc", "soh", "voltage", "current", "temperature"];
const units: Record<MeasurementMetric, string> = {
  soc: "%",
  soh: "%",
  voltage: "V",
  current: "A",
  temperature: "°C",
};

export function BatteryDetailPage() {
  const { id } = useParams();
  const batteryId = Number(id);
  const { user } = useAuth();
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
      setError(err instanceof ApiError ? err.detail : "Không thể tải pin");
    } finally {
      setLoading(false);
    }
  }, [batteryId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!battery) return null;

  const writer = canWrite(user?.role);

  const submitMeasurement = async (event: React.FormEvent) => {
    event.preventDefault();
    setMeasurementError("");
    const value = Number(measurement.value);
    if (!Number.isFinite(value)) {
      setMeasurementError("Giá trị phải là số");
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
      setMeasurementError(err instanceof ApiError ? err.detail : "Không thể ghi nhận đo");
    }
  };

  const uploadAttachment = async (file: File | undefined) => {
    if (!file) return;
    setAttachmentError("");
    try {
      await api.uploadAttachment(batteryId, file);
      await load();
    } catch (err) {
      setAttachmentError(err instanceof ApiError ? err.detail : "Không thể tải file");
    }
  };

  return (
    <div className="stack-lg">
      <div className="detail-head">
        <div>
          <span className="eyebrow">Tài sản pin</span>
          <div className="detail-title">
            <h2>{battery.asset_id}</h2>
            <StatusBadge status={battery.status} />
            <SpecBadge status={battery.specification_status} />
          </div>
          <p className="muted">
            {battery.manufacturer ?? "Chưa rõ hãng"} · {battery.model ?? "Chưa rõ model"} · {battery.chemistry ?? "Chưa rõ chemistry"}
          </p>
        </div>
        <div className="button-row">
          <Link className="btn btn-ghost" to="/batteries">Danh sách</Link>
          {writer ? (
            <>
              <Link className="btn btn-ghost" to={`/batteries/${battery.id}/edit`}>Sửa</Link>
              <Link className="btn btn-primary" to={`/batteries/${battery.id}/inspections/new`}>+ Kiểm tra</Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Thông số</span>
              <h3>Thông số pin</h3>
            </div>
          </div>
          <dl className="spec-grid">
            <div><dt>Serial</dt><dd>{battery.serial_number ?? "—"}</dd></div>
            <div><dt>Điện áp danh định</dt><dd>{formatNumber(battery.nominal_voltage_v, " V")}</dd></div>
            <div><dt>Dung lượng danh định</dt><dd>{formatNumber(battery.nominal_capacity_ah, " Ah")}</dd></div>
            <div><dt>Năng lượng ban đầu</dt><dd>{formatNumber(battery.initial_energy_kwh, " kWh")}</dd></div>
            <div><dt>Nguồn / Origin</dt><dd>{battery.source ?? "—"}</dd></div>
            <div><dt>Ngày tiếp nhận</dt><dd>{formatDate(battery.received_at)}</dd></div>
            <div><dt>Ngày tạo</dt><dd>{formatDateTime(battery.created_at)}</dd></div>
            <div><dt>Cập nhật</dt><dd>{formatDateTime(battery.updated_at)}</dd></div>
          </dl>
          {battery.notes ? <p className="note-box">{battery.notes}</p> : null}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Đo gần nhất</span>
              <h3>SOC / SOH</h3>
            </div>
            {writer ? (
              <button className="btn btn-ghost" onClick={() => setShowMeasurement((value) => !value)}>
                {showMeasurement ? "Đóng" : "+ Ghi nhận đo"}
              </button>
            ) : null}
          </div>
          <div className="grid-2 compact">
            {(["soc", "soh"] as const).map((metric) => {
              const item = latest[metric];
              return (
                <div className="measure-card" key={metric}>
                  <span>{metric.toUpperCase()}</span>
                  <strong>{item ? `${formatNumber(item.value, item.unit)}` : "Chưa có dữ liệu"}</strong>
                  {item ? (
                    <>
                      <div className="provenance-row">
                        <span className={`badge badge-source-${item.source}`}>{sourceLabels[item.source]}</span>
                        <span className={`badge badge-quality-${item.quality}`}>{qualityLabels[item.quality]}</span>
                        {item.source === "mock" ? <span className="badge badge-simulated">SIMULATED</span> : null}
                      </div>
                      <small>{formatDateTime(item.measured_at)}</small>
                    </>
                  ) : (
                    <small>Không suy diễn từ điện áp.</small>
                  )}
                </div>
              );
            })}
          </div>

          {showMeasurement ? (
            <form className="inline-form" onSubmit={submitMeasurement}>
              <div className="form-grid compact">
                <label className="field">
                  <span>Metric</span>
                  <select
                    className="select"
                    value={measurement.metric}
                    onChange={(event) => {
                      const metric = event.target.value as MeasurementMetric;
                      setMeasurement((value) => ({ ...value, metric, unit: units[metric] }));
                    }}
                  >
                    {metrics.map((metric) => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Giá trị</span>
                  <input className="input" type="number" step="0.001" value={measurement.value} onChange={(event) => setMeasurement((value) => ({ ...value, value: event.target.value }))} required />
                </label>
                <label className="field">
                  <span>Đơn vị</span>
                  <input className="input" value={measurement.unit} onChange={(event) => setMeasurement((value) => ({ ...value, unit: event.target.value }))} required />
                </label>
                <label className="field">
                  <span>Nguồn</span>
                  <select className="select" value={measurement.source} onChange={(event) => setMeasurement((value) => ({ ...value, source: event.target.value }))}>
                    <option value="manual">Manual</option>
                    <option value="mock">Mock / SIMULATED</option>
                  </select>
                </label>
                <label className="field">
                  <span>Chất lượng</span>
                  <select className="select" value={measurement.quality} onChange={(event) => setMeasurement((value) => ({ ...value, quality: event.target.value }))}>
                    <option value="measured">Measured</option>
                    <option value="estimated">Estimated</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="field">
                  <span>Thời điểm đo</span>
                  <input className="input" type="datetime-local" value={measurement.measured_at} onChange={(event) => setMeasurement((value) => ({ ...value, measured_at: event.target.value }))} />
                </label>
              </div>
              <label className="field">
                <span>Ghi chú</span>
                <input className="input" value={measurement.notes} onChange={(event) => setMeasurement((value) => ({ ...value, notes: event.target.value }))} />
              </label>
              {measurementError ? <div className="form-error">{measurementError}</div> : null}
              <button className="btn btn-primary">Lưu measurement</button>
            </form>
          ) : null}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Lịch sử đo</span>
            <h3>Lịch sử đo</h3>
          </div>
          <span className="toolbar-count">{measurements.length} bản ghi</span>
        </div>
        {measurements.length === 0 ? (
          <EmptyState title="Chưa có measurement" detail="Ghi nhận SOC/SOH hoặc thông số đo khác." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Metric</th><th>Giá trị</th><th>Nguồn</th><th>Chất lượng</th><th>Thời điểm</th><th>Ghi chú</th></tr></thead>
              <tbody>
                {measurements.slice(0, 20).map((item) => (
                  <tr key={item.id}>
                    <td>{metricLabels[item.metric]}</td>
                    <td><strong>{formatNumber(item.value, item.unit)}</strong></td>
                    <td>
                      <span className={`badge badge-source-${item.source}`}>{sourceLabels[item.source]}</span>
                    </td>
                    <td>
                      <span className={`badge badge-quality-${item.quality}`}>{qualityLabels[item.quality]}</span>
                      {item.source === "mock" ? <span className="badge badge-simulated">SIMULATED</span> : null}
                    </td>
                    <td>{formatDateTime(item.measured_at)}</td>
                    <td>{item.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Kiểm tra</span>
              <h3>Kiểm tra & kiểm thử</h3>
            </div>
            {writer ? <Link className="btn btn-ghost" to={`/batteries/${battery.id}/inspections/new`}>+ Thêm</Link> : null}
          </div>
          {inspections.length === 0 ? (
            <EmptyState title="Chưa có lần kiểm tra" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Loại</th><th>Kết quả</th><th>Thời điểm</th></tr></thead>
                <tbody>
                  {inspections.map((item) => (
                    <tr key={item.id}>
                      <td>{item.test_type}</td>
                      <td><span className={`result result-${item.result}`}>{inspectionResultLabels[item.result]}</span></td>
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
              <span className="eyebrow">Bằng chứng</span>
              <h3>Tệp đính kèm</h3>
            </div>
            {writer ? (
              <label className="btn btn-ghost upload-label">
                + Tải file
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void uploadAttachment(event.target.files?.[0])} />
              </label>
            ) : null}
          </div>
          {attachmentError ? <div className="form-error">{attachmentError}</div> : null}
          {attachments.length === 0 ? (
            <EmptyState title="Chưa có bằng chứng" detail="Hỗ trợ JPEG, PNG, WEBP, PDF tối đa 20 MB." />
          ) : (
            <ul className="attachment-list">
              {attachments.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.filename}</strong>
                    <small>{formatBytes(item.size_bytes)} · {formatDateTime(item.created_at)}</small>
                  </div>
                  <a className="btn btn-ghost" href={api.downloadUrl(item.id)} target="_blank" rel="noreferrer">Mở</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Lịch sử thay đổi</span>
            <h3>Dòng thời gian vòng đời</h3>
          </div>
        </div>
        {events.length === 0 ? (
          <EmptyState title="Chưa có sự kiện" />
        ) : (
          <ol className="timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className={`timeline-dot event-${event.event_type}`} />
                <div className="timeline-body">
                  <div className="timeline-title">
                    <strong>{eventLabels[event.event_type]}</strong>
                    <time>{formatDateTime(event.event_at)}</time>
                  </div>
                  {event.notes ? <p>{event.notes}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
