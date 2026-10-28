import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { roleLabels } from "../format";

const navItems = [
  { to: "/", label: "Tổng quan", end: true },
  { to: "/batteries", label: "Pin & tài sản" },
  { to: "/users", label: "Người dùng", adminOnly: true },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const title =
    location.pathname === "/"
      ? "Tổng quan vận hành"
      : location.pathname.startsWith("/batteries")
        ? "Pin & vòng đời"
        : location.pathname.startsWith("/users")
          ? "Quản lý người dùng"
          : "PinLab";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">P</span>
          <div>
            <strong>PinLab</strong>
            <small>Battery Lifecycle</small>
          </div>
        </div>

        <nav className="main-nav" onClick={() => setMenuOpen(false)}>
          {navItems
            .filter((item) => !item.adminOnly || user?.role === "admin")
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                <span className="nav-dot" />
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="sidebar-foot">
          <a className="nav-link" href="/api/docs" target="_blank" rel="noreferrer">
            <span className="nav-dot" />
            API / OpenAPI
          </a>
          <div className="sidebar-user">
            <span className="avatar">{(user?.full_name ?? "?").slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user?.full_name}</strong>
              <small>{user ? roleLabels[user.role] : ""}</small>
            </div>
          </div>
          <button className="btn btn-ghost btn-full" onClick={() => void handleLogout()}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Mở menu">
            ☰
          </button>
          <div>
            <span className="eyebrow">PinLab / Battery Lifecycle</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar-meta">
            <span className="env-pill">MVP</span>
            <span className="topbar-user">{user?.full_name}</span>
          </div>
        </header>
        <main className="page-wrap">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
