import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { canWrite, useAuth } from "../auth";
import { Loading } from "../components/States";
import { batteryStatusLabels, specificationLabels } from "../format";
import type { BatteryStatus, SpecificationStatus } from "../types";

const STATUS_OPTIONS = Object.keys(batteryStatusLabels) as BatteryStatus[];
const SPEC_OPTIONS = Object.keys(specificationLabels) as SpecificationStatus[];

type FormState = Record<string, string>;

const emptyForm: FormState = {
  asset_id: "",
  serial_number: "",
  manufacturer: "",
  model: "",
  chemistry: "",
  nominal_voltage_v: "",
  nominal_capacity_ah: "",
  initial_energy_kwh: "",
  status: "received",
  specification_status: "unknown",
  source: "",
  received_at: "",
  notes: "",
};

export function BatteryFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(id);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let active = true;
    api
      .getBattery(Number(id))
      .then((battery) => {
        if (!active) return;
        setForm({
          asset_id: battery.asset_id,
          serial_number: battery.serial_number ?? "",
          manufacturer: battery.manufacturer ?? "",
          model: battery.model ?? "",
          chemistry: battery.chemistry ?? "",
          nominal_voltage_v: battery.nominal_voltage_v?.toString() ?? "",
          nominal_capacity_ah: battery.nominal_capacity_ah?.toString() ?? "",
          initial_energy_kwh: battery.initial_energy_kwh?.toString() ?? "",
          status: battery.status,
          specification_status: battery.specification_status,
          source: battery.source ?? "",
          received_at: battery.received_at ?? "",
          notes: battery.notes ?? "",
        });
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  if (!canWrite(user?.role)) {
    return (
      <div className="state-box state-error">
        <strong>Không có quyền chỉnh sửa</strong>
        <span>Tài khoản Viewer chỉ được xem dữ liệu.</span>
      </div>
    );
  }

  if (loading) return <Loading />;

  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const numeric = (value: string) => (value.trim() === "" ? null : Number(value));
    const payload: Record<string, unknown> = {
      asset_id: form.asset_id.trim(),
      serial_number: form.serial_number.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      chemistry: form.chemistry.trim() || null,
      nominal_voltage_v: numeric(form.nominal_voltage_v),
      nominal_capacity_ah: numeric(form.nominal_capacity_ah),
      initial_energy_kwh: numeric(form.initial_energy_kwh),
      status: form.status,
      specification_status: form.specification_status,
      source: form.source.trim() || null,
      received_at: form.received_at || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (isEdit && id) {
        await api.updateBattery(Number(id), payload);
        navigate(`/batteries/${id}`);
      } else {
        const created = await api.createBattery(payload);
        navigate(`/batteries/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Không thể lưu pin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{isEdit ? "Cập nhật tài sản" : "Đăng ký tài sản"}</span>
          <h2>{isEdit ? "Sửa thông tin pin" : "Thêm pin mới"}</h2>
          <p className="muted">
            Trường chưa biết có thể để trống. Chọn “Chưa xác định” thay vì tự suy diễn thông số.
          </p>
        </div>
        <Link className="btn btn-ghost" to={id ? `/batteries/${id}` : "/batteries"}>
          Quay lại
        </Link>
      </div>

      <form className="card form-card" onSubmit={onSubmit}>
        <div className="form-grid">
          <label className="field">
            <span>Asset ID *</span>
            <input className="input" value={form.asset_id} onChange={(e) => update("asset_id", e.target.value)} required />
          </label>
          <label className="field">
            <span>Serial number</span>
            <input className="input" value={form.serial_number} onChange={(e) => update("serial_number", e.target.value)} />
          </label>
          <label className="field">
            <span>Manufacturer</span>
            <input className="input" value={form.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} />
          </label>
          <label className="field">
            <span>Model</span>
            <input className="input" value={form.model} onChange={(e) => update("model", e.target.value)} />
          </label>
          <label className="field">
            <span>Chemistry</span>
            <input className="input" placeholder="LFP, NMC…" value={form.chemistry} onChange={(e) => update("chemistry", e.target.value)} />
          </label>
          <label className="field">
            <span>Nominal voltage (V)</span>
            <input className="input" type="number" step="0.001" min="0" value={form.nominal_voltage_v} onChange={(e) => update("nominal_voltage_v", e.target.value)} />
          </label>
          <label className="field">
            <span>Nominal capacity (Ah)</span>
            <input className="input" type="number" step="0.001" min="0" value={form.nominal_capacity_ah} onChange={(e) => update("nominal_capacity_ah", e.target.value)} />
          </label>
          <label className="field">
            <span>Initial energy (kWh)</span>
            <input className="input" type="number" step="0.001" min="0" value={form.initial_energy_kwh} onChange={(e) => update("initial_energy_kwh", e.target.value)} />
          </label>
          <label className="field">
            <span>Trạng thái</span>
            <select className="select" value={form.status} onChange={(e) => update("status", e.target.value)}>
              {STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>{batteryStatusLabels[value]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Mức xác nhận thông số</span>
            <select className="select" value={form.specification_status} onChange={(e) => update("specification_status", e.target.value)}>
              {SPEC_OPTIONS.map((value) => (
                <option key={value} value={value}>{specificationLabels[value]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Nguồn / Origin</span>
            <input className="input" value={form.source} onChange={(e) => update("source", e.target.value)} />
          </label>
          <label className="field">
            <span>Ngày tiếp nhận</span>
            <input className="input" type="date" value={form.received_at} onChange={(e) => update("received_at", e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Ghi chú</span>
          <textarea className="textarea" rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </label>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="form-actions">
          <Link className="btn btn-ghost" to={id ? `/batteries/${id}` : "/batteries"}>Hủy</Link>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu pin"}
          </button>
        </div>
      </form>
    </div>
  );
}
