import { useAuth } from "../auth/AuthContext";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const initials =
    user?.name
      ?.split(" ")
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U";

  const handleProfileClick = () => {
    navigate("/app/profile");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header
      style={{
        height: 64,
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 22px",
        background:
          "radial-gradient(circle at top left, rgba(79,70,229,0.25), transparent 55%)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
        }}
        onClick={handleProfileClick}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "999px",
            background:
              "linear-gradient(135deg, #6366f1, #ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {initials}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
          <span style={{ fontWeight: 500 }}>
            {user?.name || "Пользователь"}
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
            {user?.email}
          </span>
        </div>
      </div>

      <button
        onClick={handleLogout}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 999,
          border: "1px solid rgba(248,250,252,0.12)",
          background: "rgba(15,23,42,0.7)",
          color: "var(--text)",
          fontSize: 13,
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <LogOut size={16} />
        Выйти
      </button>
    </header>
  );
}
