import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { useI18n, type Lang } from "../i18n";

export function LoginPage() {
  const { login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const nextUser = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(nextUser.must_change_password ? "/change-password" : from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  const changeLang = (next: Lang) => setLang(next);

  return (
    <div className="auth-shell">
      <section className="auth-brand">
        <div className="brand brand-large">
          <span className="brand-mark">P</span>
          <div>
            <strong>{t("app.name")}</strong>
            <small>{t("app.tagline")}</small>
          </div>
        </div>
        <div className="auth-copy">
          <span className="login-kicker">{t("login.kicker")}</span>
          <h1>{t("login.title")}</h1>
          <p>{t("login.subtitle")}</p>
          <div className="auth-points">
            <span>{t("login.pointAsset")}</span>
            <span>{t("login.pointEvidence")}</span>
            <span>{t("login.pointWarranty")}</span>
          </div>
        </div>
        <div className="auth-note">{t("login.footNote")}</div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-lang">
            <div className="lang-switch" role="group" aria-label={t("common.language")}>
              <button className={lang === "vi" ? "active" : ""} onClick={() => changeLang("vi")} aria-pressed={lang === "vi"}>VI</button>
              <button className={lang === "en" ? "active" : ""} onClick={() => changeLang("en")} aria-pressed={lang === "en"}>EN</button>
            </div>
          </div>
          <span className="eyebrow">{t("login.internal")}</span>
          <h2>{t("login.welcome")}</h2>
          <p className="muted">{t("login.panelHint")}</p>
          {(location.state as { passwordChanged?: boolean } | null)?.passwordChanged ? (
            <div className="form-success">{t("password.changed")}</div>
          ) : null}
          <div className="login-demo-note"><span aria-hidden="true">i</span>{t("login.demoNotice")}</div>

          <form onSubmit={onSubmit} className="stack">
            <label className="field">
              <span>{t("login.email")}</span>
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>{t("login.password")}</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error ? <div className="form-error">{error}</div> : null}
            <button className="btn btn-primary btn-full" disabled={submitting}>
              {submitting ? t("login.submitting") : t("login.submit")}
            </button>
          </form>

          <p className="auth-foot">{t("login.footer")}</p>
        </div>
      </section>
    </div>
  );
}
