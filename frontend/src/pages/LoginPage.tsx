import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";

export function LoginPage() {
  const { login } = useAuth();
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
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Không thể đăng nhập");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-brand">
        <div className="brand brand-large">
          <span className="brand-mark">P</span>
          <div>
            <strong>PinLab</strong>
            <small>Battery Lifecycle</small>
          </div>
        </div>
        <h1>Quản lý vòng đời pin, rõ ràng và có bằng chứng.</h1>
        <p>
          Đăng ký tài sản pin, ghi nhận kiểm tra, theo dõi SOC/SOH và lịch sử vòng đời
          trong một hệ thống nội bộ duy nhất.
        </p>
        <div className="auth-points">
          <span>Battery registry</span>
          <span>Inspection & evidence</span>
          <span>Lifecycle timeline</span>
        </div>
        <div className="auth-note">DEMO data is explicitly labelled SIMULATED. No hardware control.</div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">Đăng nhập nội bộ</span>
          <h2>Chào mừng trở lại</h2>
          <p className="muted">Tài khoản do quản trị viên PinLab cấp.</p>

          <form onSubmit={onSubmit} className="stack">
            <label className="field">
              <span>Email</span>
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
              <span>Mật khẩu</span>
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
              {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>

          <p className="auth-foot">
            Không có tài khoản mặc định. Liên hệ CTO/quản trị viên để được cấp quyền.
          </p>
        </div>
      </section>
    </div>
  );
}
