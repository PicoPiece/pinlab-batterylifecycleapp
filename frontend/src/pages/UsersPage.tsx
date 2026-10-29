import { useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { ErrorState, Loading } from "../components/States";
import { formatDateTime } from "../format";
import type { AdminPasswordResetResponse, Role, User } from "../types";

export function UsersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ email: "", full_name: "", role: "viewer" as Role, password: "" });
  const [saving, setSaving] = useState(false);
  const [resetResult, setResetResult] = useState<AdminPasswordResetResponse | null>(null);
  const [resetBusy, setResetBusy] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to load users");
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
        <strong>{t("users.noPermission")}</strong>
        <span>{t("access.noPermission")}</span>
      </div>
    );
  }

  const resetPassword = async (target: User) => {
    if (!window.confirm(t("password.resetConfirm", { email: target.email }))) return;
    setResetBusy(target.id);
    setError("");
    try {
      setResetResult(await api.resetUserPassword(target.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to reset password");
    } finally {
      setResetBusy(null);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await api.createUser(form);
      setMessage(`✓ ${created.email}`);
      setForm({ email: "", full_name: "", role: "viewer", password: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{t("users.kicker")}</span>
          <h2>{t("users.title")}</h2>
          <p className="muted">{t("users.subtitle")}</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div><span className="eyebrow">{t("users.list")}</span><h3>{t("users.accounts")}</h3></div>
            <span className="toolbar-count">{users.length}</span>
          </div>
          {loading ? <Loading /> : error ? <ErrorState message={error} /> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>{t("users.fullName")}</th><th>Email</th><th>{t("users.role")}</th><th>{t("users.accountStatus")}</th><th>{t("users.created")}</th><th>{t("common.actions")}</th></tr></thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.full_name}</strong></td>
                      <td>{item.email}</td>
                      <td>{t(`role.${item.role}`)}</td>
                      <td>
                        {item.is_active ? t("users.active") : t("users.inactive")}
                        {item.must_change_password ? <div><span className="badge badge-inspecting">{t("password.mustChange")}</span></div> : null}
                      </td>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>
                        {item.id === user?.id ? <span className="muted">—</span> : (
                          <button className="reset-button" disabled={resetBusy === item.id} onClick={() => void resetPassword(item)}>
                            {resetBusy === item.id ? t("common.loading") : t("password.resetAction")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head"><div><span className="eyebrow">{t("users.create")}</span><h3>{t("users.add")}</h3></div></div>
          <form className="stack" onSubmit={onSubmit}>
            <label className="field"><span>Email *</span><input className="input" type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} required /></label>
            <label className="field"><span>{t("users.fullName")} *</span><input className="input" value={form.full_name} onChange={(event) => setForm((value) => ({ ...value, full_name: event.target.value }))} required /></label>
            <label className="field"><span>{t("users.role")} *</span>
              <select className="select" value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value as Role }))}>
                {(["admin", "technician", "viewer"] as Role[]).map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
              </select>
            </label>
            <label className="field"><span>{t("users.tempPassword")} *</span><input className="input" type="password" minLength={8} value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} required /></label>
            {message ? <div className="form-success">{message}</div> : null}
            <button className="btn btn-primary" disabled={saving}>{saving ? t("users.creating") : t("users.createButton")}</button>
          </form>
        </section>
      </div>

      {resetResult ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setResetResult(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={(event) => event.stopPropagation()}>
            <span className="eyebrow">{t("users.create")}</span>
            <h2 id="reset-title">{t("password.resetTitle")}</h2>
            <p>{t("password.resetHint")}</p>
            <p><strong>{resetResult.user.full_name}</strong> · {resetResult.user.email}</p>
            <div className="temp-password">
              <code>{resetResult.temporary_password}</code>
              <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(resetResult.temporary_password)}>{t("password.copy")}</button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setResetResult(null)}>{t("password.close")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
