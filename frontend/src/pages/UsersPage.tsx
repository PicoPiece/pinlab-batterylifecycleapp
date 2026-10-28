import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { ErrorState, Loading } from "../components/States";
import { formatDateTime, roleLabels } from "../format";
import type { Role, User } from "../types";

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ email: "", full_name: "", role: "viewer" as Role, password: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Không thể tải người dùng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") void load();
    else setLoading(false);
  }, [user?.role]);

  if (user?.role !== "admin") {
    return (
      <div className="state-box state-error">
        <strong>Không có quyền truy cập</strong>
        <span>Chỉ quản trị viên được quản lý người dùng.</span>
      </div>
    );
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await api.createUser(form);
      setMessage(`Đã tạo ${created.email}`);
      setForm({ email: "", full_name: "", role: "viewer", password: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Không thể tạo người dùng");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Access control</span>
          <h2>Người dùng & vai trò</h2>
          <p className="muted">Admin, Technician và Viewer. Phân quyền được kiểm tra ở backend.</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Danh sách</span>
              <h3>Tài khoản</h3>
            </div>
            <span className="toolbar-count">{users.length}</span>
          </div>
          {loading ? <Loading /> : error ? <ErrorState message={error} /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Tạo</th></tr></thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.full_name}</strong></td>
                      <td>{item.email}</td>
                      <td>{roleLabels[item.role]}</td>
                      <td>{item.is_active ? "Hoạt động" : "Đã khóa"}</td>
                      <td>{formatDateTime(item.created_at)}</td>
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
              <span className="eyebrow">Tạo mới</span>
              <h3>Thêm người dùng</h3>
            </div>
          </div>
          <form className="stack" onSubmit={onSubmit}>
            <label className="field">
              <span>Email *</span>
              <input className="input" type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} required />
            </label>
            <label className="field">
              <span>Họ tên *</span>
              <input className="input" value={form.full_name} onChange={(event) => setForm((value) => ({ ...value, full_name: event.target.value }))} required />
            </label>
            <label className="field">
              <span>Vai trò *</span>
              <select className="select" value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value as Role }))}>
                {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Mật khẩu tạm *</span>
              <input className="input" type="password" minLength={8} value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} required />
            </label>
            {message ? <div className="form-success">{message}</div> : null}
            <button className="btn btn-primary" disabled={saving}>{saving ? "Đang tạo…" : "Tạo người dùng"}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
