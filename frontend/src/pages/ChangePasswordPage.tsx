import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";

export function ChangePasswordPage() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const forced = Boolean(user?.must_change_password);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const validate = () => {
    if (next.length < 12) return t("password.tooShort");
    if (next !== confirm) return t("password.mismatch");
    if (next === current) return t("password.reused");
    return "";
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.changePassword({ current_password: current, new_password: next, confirm_password: confirm });
      setSuccess(t("password.success"));
      await logout().catch(() => undefined);
      navigate("/login", { replace: true, state: { passwordChanged: true } });
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : "";
      if (detail.includes("hiện tại")) setError(t("password.wrongCurrent"));
      else setError(detail || t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-shell">
      <header className="account-header">
        <Link className="brand" to="/">
          <span className="brand-mark">P</span>
          <span><strong>PinLab</strong><small>Battery Lifecycle</small></span>
        </Link>
        <div className="account-header-actions">
          <div className="lang-switch" role="group" aria-label={t("common.language")}>
            <button className={lang === "vi" ? "active" : ""} onClick={() => setLang("vi")}>VI</button>
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await logout().catch(() => undefined); navigate("/login", { replace: true }); }}>{t("nav.logout")}</button>
        </div>
      </header>

      <main className="account-card">
        <span className="eyebrow">{forced ? t("login.welcome") : t("password.account")}</span>
        <h1>{t("password.changeTitle")}</h1>
        <p className="muted">{t("password.changeSubtitle")}</p>
        {forced ? <div className="account-force">{t("password.forced")}</div> : null}
        {success ? <div className="form-success">{success}</div> : null}

        <form className="stack" onSubmit={onSubmit}>
          <label className="field"><span>{t("password.current")}</span>
            <input className="input" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
          </label>
          <label className="field"><span>{t("password.new")}</span>
            <input className="input" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} required minLength={12} />
          </label>
          <label className="field"><span>{t("password.confirm")}</span>
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={12} />
          </label>
          <p className="account-policy">{t("password.policy")}</p>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <button className="btn btn-primary btn-full" disabled={saving}>{saving ? t("password.submitting") : t("password.submit")}</button>
        </form>

        {!forced ? <Link className="account-back" to="/">{t("password.back")} →</Link> : null}
      </main>
    </div>
  );
}
