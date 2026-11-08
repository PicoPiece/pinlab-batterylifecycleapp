import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n, type Lang } from "../i18n";
import type { DashboardSummary } from "../types";

const navItems = [
  { to: "/", key: "nav.overview", end: true },
  { to: "/batteries", key: "nav.fleet" },
  { to: "/inspections", key: "nav.inspections" },
  { to: "/warranty", key: "nav.warranty", preview: true },
  { to: "/monitoring", key: "nav.monitoring", preview: true },
  { to: "/users", key: "nav.access", adminOnly: true },
];

const mobileNavItems = [
  { to: "/", key: "mobile.home", icon: "⌂", end: true },
  { to: "/batteries", key: "mobile.assets", icon: "▣" },
  { to: "/inspections", key: "mobile.inspections", icon: "✓" },
  { to: "/change-password", key: "mobile.account", icon: "◉" },
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
  const { user, access, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const check = async () => {
      try {
        await api.health();
        if (active) setOnline(true);
      } catch {
        if (active) setOnline(false);
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      return;
    }
    let active = true;
    api.dashboard()
      .then((data) => {
        if (!active) return;
        setSummary(data);
        setLastRefresh(new Date());
      })
      .catch(() => active && setSummary(null));
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
  const effectiveRole = access?.is_super_admin
    ? "pinlab_super_admin"
    : access?.is_manager
      ? "pinlab_manager"
      : access?.is_agency_admin
        ? "agency_admin"
        : access?.can_write
          ? "technician"
          : "viewer";
  const realBatteries = summary?.real_batteries ?? 0;
  const demoBatteries = summary?.demo_batteries ?? 0;
  const dataMode = realBatteries > 0
    ? (demoBatteries > 0 ? "mixed" : "production")
    : demoBatteries > 0
      ? "demo"
      : "unclassified";
  const dataModeLabel = t(`nav.env${dataMode === "production" ? "Production" : dataMode === "mixed" ? "Mixed" : dataMode === "demo" ? "Demo" : "Unclassified"}`);
  const datasetLabel = t(`nav.${dataMode === "production" ? "productionDataset" : dataMode === "mixed" ? "mixedDataset" : dataMode === "demo" ? "demoDataset" : "unclassifiedDataset"}`);
  const dataNote = dataMode === "production"
    ? t("nav.productionNote", { real: realBatteries, demo: demoBatteries })
    : dataMode === "mixed"
      ? t("nav.mixedNote", { real: realBatteries, demo: demoBatteries })
      : dataMode === "demo"
        ? t("nav.demoNote")
        : t("nav.unclassifiedNote", { n: summary?.unclassified_batteries ?? 0 });

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
          <span className={`workspace-dot workspace-dot-${dataMode}`} title={dataModeLabel} />
        </div>

        <nav className="main-nav" aria-label="Primary navigation" onClick={() => setMenuOpen(false)}>
          {navItems
            .filter((item) => !item.adminOnly || access?.can_manage_access)
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
          <strong>{datasetLabel}</strong>
          <p>{dataNote}</p>
          <span className="sidebar-status">{summary === null ? t("common.noData") : t("nav.assets", { n: summary.total_batteries })}</span>
          <small className="sidebar-refresh">
            {lastRefresh
              ? t("common.lastRefresh", { time: lastRefresh.toLocaleTimeString() })
              : t("common.noRefresh")}
          </small>
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
              <small>{user ? t(`role.${effectiveRole}`) : ""}</small>
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
            <span className={`connection-pill ${online ? "connection-online" : "connection-offline"}`}>
              {online ? t("common.online") : t("common.offline")}
            </span>
            <span className="env-pill">{dataModeLabel}</span>
            <span className="topbar-user">{user?.full_name}</span>
          </div>
        </header>
        <main className="page-wrap" id="main-content">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label={t("mobile.home")}>
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? "mobile-nav-item active" : "mobile-nav-item")}
          >
            <span className="mobile-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{t(item.key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
