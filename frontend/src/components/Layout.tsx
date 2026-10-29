import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n, type Lang } from "../i18n";

const navItems = [
  { to: "/", key: "nav.overview", end: true },
  { to: "/batteries", key: "nav.fleet" },
  { to: "/inspections", key: "nav.inspections" },
  { to: "/warranty", key: "nav.warranty", preview: true },
  { to: "/monitoring", key: "nav.monitoring", preview: true },
  { to: "/users", key: "nav.access", adminOnly: true },
];

const pageKeys: Record<string, string> = {
  "/": "nav.overview",
  "/batteries": "passport.title",
  "/inspections": "nav.inspections",
  "/warranty": "nav.warranty",
  "/monitoring": "nav.monitoring",
  "/users": "nav.access",
};

export function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [assetCount, setAssetCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setAssetCount(null);
      return;
    }
    let active = true;
    api.dashboard()
      .then((data) => active && setAssetCount(data.total_batteries))
      .catch(() => active && setAssetCount(null));
    return () => {
      active = false;
    };
  }, [user]);

  const isBatteryDetail = /^\/batteries\/\d+/.test(location.pathname);
  const pageKey = location.pathname === "/"
    ? "nav.overview"
    : isBatteryDetail
      ? "passport.title"
      : location.pathname.startsWith("/batteries")
        ? "nav.fleet"
        : Object.entries(pageKeys).find(([path]) => path !== "/" && path !== "/batteries" && location.pathname.startsWith(path))?.[1]
          ?? "nav.overview";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const changeLang = (next: Lang) => setLang(next);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("common.skip")}
      </a>
      <div
        className={`nav-backdrop ${menuOpen ? "nav-backdrop-open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">P</span>
          <div>
            <strong>{t("app.name")}</strong>
            <small>{t("app.tagline")}</small>
          </div>
        </div>

        <div className="workspace-card">
          <span className="workspace-icon" aria-hidden="true">▦</span>
          <div>
            <small>{t("nav.workspace")}</small>
            <strong>{t("nav.agency")}</strong>
          </div>
          <span className="workspace-dot" title={t("common.demo")} />
        </div>

        <nav className="main-nav" aria-label="Primary navigation" onClick={() => setMenuOpen(false)}>
          {navItems
            .filter((item) => !item.adminOnly || user?.role === "admin")
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                <span className="nav-dot" aria-hidden="true" />
                <span>{t(item.key)}</span>
                {item.preview ? <span className="nav-flag">{t("nav.preview")}</span> : null}
              </NavLink>
            ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-data-card">
          <span className="eyebrow">{t("nav.dataMode")}</span>
          <strong>{t("nav.demoDataset")}</strong>
          <p>{t("nav.demoNote")}</p>
          <span className="sidebar-status">{assetCount === null ? t("nav.demoDataset") : t("nav.assets", { n: assetCount })}</span>
        </div>
        <div className="sidebar-foot">
          <NavLink className="nav-link account-link" to="/change-password">
            <span className="nav-dot" aria-hidden="true" />
            {t("password.account")}
          </NavLink>
          <div className="sidebar-user">
            <span className="avatar">{(user?.full_name ?? "?").slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user?.full_name}</strong>
              <small>{user ? t(`role.${user.role}`) : ""}</small>
            </div>
          </div>
          <button className="btn btn-ghost btn-full" onClick={() => void handleLogout()}>
            {t("nav.logout")}
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={menuOpen}
          >
            ☰
          </button>
          <div className="topbar-title">
            <span className="eyebrow">PinLab / Battery Lifecycle</span>
            <h1>{t(pageKey)}</h1>
          </div>
          <div className="topbar-meta">
            <div className="lang-switch" role="group" aria-label={t("common.language")}>
              <button className={lang === "vi" ? "active" : ""} onClick={() => changeLang("vi")} aria-pressed={lang === "vi"}>
                VI
              </button>
              <button className={lang === "en" ? "active" : ""} onClick={() => changeLang("en")} aria-pressed={lang === "en"}>
                EN
              </button>
            </div>
            <span className="env-pill">AGENCY PREVIEW</span>
            <span className="topbar-user">{user?.full_name}</span>
          </div>
        </header>
        <main className="page-wrap" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
