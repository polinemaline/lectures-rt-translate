// frontend/src/components/AppLayout.jsx
import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const displayName =
    user?.displayName || user?.full_name || user?.email || "";

  const avatarLetter = displayName.trim().charAt(0).toUpperCase();
  const email = user?.email || "";

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="app-shell">
      {/* TOPBAR */}
      <header className="app-header">
        <div className="app-header-left">
          <button
            type="button"
            className="app-header-avatar"
            onClick={() => navigate("/profile")}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" />
            ) : (
              avatarLetter || "?"
            )}
          </button>
          {email && <span className="app-header-user-name">{email}</span>}
        </div>

        <div className="app-header-right">
          <button
            type="button"
            className="app-logout-btn"
            onClick={handleLogout}
          >
            Выйти
          </button>
        </div>
      </header>

      {/* BODY: sidebar + контент */}
      <div className="app-body">
        <aside className="app-sidebar">
          <nav className="app-sidebar-nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                "app-sidebar-link" +
                (isActive ? " app-sidebar-link_active" : "")
              }
            >
              Конференции
            </NavLink>

            <NavLink
              to="/notes"
              className={({ isActive }) =>
                "app-sidebar-link" +
                (isActive ? " app-sidebar-link_active" : "")
              }
            >
              Конспекты
            </NavLink>

            <NavLink
              to="/uploads"
              className={({ isActive }) =>
                "app-sidebar-link" +
                (isActive ? " app-sidebar-link_active" : "")
              }
            >
              Загрузки
            </NavLink>
          </nav>
        </aside>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
