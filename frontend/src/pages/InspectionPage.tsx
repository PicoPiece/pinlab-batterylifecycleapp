import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { canWrite, useAuth } from "../auth";
import { Loading } from "../components/States";
import { inspectionResultLabels } from "../format";
import type { Battery, InspectionResult } from "../types";

function localNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

interface ParameterRow {
  key: string;
  value: string;
}

export function InspectionPage() {
  const { id } = useParams();
  const batteryId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [battery, setBattery] = useState<Battery | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testType, setTestType] = useState("Visual inspection");
  const [inspectedAt, setInspectedAt] = useState(localNow());
  const [result, setResult] = useState<InspectionResult>("passed");
  const [notes, setNotes] = useState("");
  const [parameters, setParameters] = useState<ParameterRow[]>([
    { key: "voltage", value: "" },
    { key: "capacity", value: "" },
    { key: "temperature", value: "" },
  ]);
  const [file, setFile] = useState<File | undefined>();

  useEffect(() => {
    if (!Number.isFinite(batteryId)) return;
    let active = true;
    api
      .getBattery(batteryId)
      .then((data) => active && setBattery(data))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [batteryId]);

  if (!canWrite(user?.role)) {
    return (
      <div className="state-box state-error">
        <strong>Không có quyền ghi nhận kiểm tra</strong>
        <span>Tài khoản Viewer chỉ được xem dữ liệu.</span>
      </div>
    );
  }

  if (loading) return <Loading />;

  const updateParameter = (index: number, key: "key" | "value", value: string) => {
    setParameters((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const measured: Record<string, string> = {};
    parameters.forEach((row) => {
      if (row.key.trim() && row.value.trim()) measured[row.key.trim()] = row.value.trim();
    });

    try {
      const inspection = await api.createInspection(batteryId, {
        test_type: testType.trim(),
        inspected_at: inspectedAt ? new Date(inspectedAt).toISOString() : null,
        result,
        measured_parameters: measured,
        notes: notes.trim() || null,
      });
      if (file) {
        await api.uploadInspectionAttachment(inspection.id, file);
      }
      navigate(`/batteries/${batteryId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Không thể lưu kiểm tra");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Bản ghi kiểm tra</span>
          <h2>Ghi nhận kiểm tra</h2>
          <p className="muted">
            {battery ? `${battery.asset_id} · ${battery.manufacturer ?? "Chưa rõ hãng"}` : "Đang tải pin…"}
          </p>
        </div>
        <Link className="btn btn-ghost" to={`/batteries/${batteryId}`}>Quay lại</Link>
      </div>

      <form className="card form-card" onSubmit={onSubmit}>
        <div className="form-grid">
          <label className="field">
            <span>Loại kiểm tra *</span>
            <input className="input" value={testType} onChange={(event) => setTestType(event.target.value)} required />
          </label>
          <label className="field">
            <span>Thời điểm</span>
            <input className="input" type="datetime-local" value={inspectedAt} onChange={(event) => setInspectedAt(event.target.value)} />
          </label>
          <label className="field">
            <span>Kết quả *</span>
            <select className="select" value={result} onChange={(event) => setResult(event.target.value as InspectionResult)}>
              {Object.entries(inspectionResultLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Bằng chứng (tuỳ chọn)</span>
            <input className="input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0])} />
          </label>
        </div>

        <div className="section-block">
          <div className="section-head">
            <div>
              <span className="eyebrow">Thông số đo</span>
              <h3>Thông số đo</h3>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setParameters((rows) => [...rows, { key: "", value: "" }])}>
              + Thêm dòng
            </button>
          </div>
          <p className="muted small">Chỉ nhập giá trị thực đo. Không tự suy diễn SOH từ điện áp.</p>
          <div className="parameter-list">
            {parameters.map((row, index) => (
              <div className="parameter-row" key={index}>
                <input className="input" placeholder="Tên thông số" value={row.key} onChange={(event) => updateParameter(index, "key", event.target.value)} />
                <input className="input" placeholder="Giá trị (kèm đơn vị nếu cần)" value={row.value} onChange={(event) => updateParameter(index, "value", event.target.value)} />
                <button type="button" className="btn btn-ghost" onClick={() => setParameters((rows) => rows.filter((_, i) => i !== index))}>Xóa</button>
              </div>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Ghi chú</span>
          <textarea className="textarea" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        {error ? <div className="form-error">{error}</div> : null}
        <div className="form-actions">
          <Link className="btn btn-ghost" to={`/batteries/${batteryId}`}>Hủy</Link>
          <button className="btn btn-primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu kiểm tra"}</button>
        </div>
      </form>
    </div>
  );
}
