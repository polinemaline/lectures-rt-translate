import { NavLink } from "react-router-dom";
import {
  CalendarDays,
  FileText,
  Upload,
} from "lucide-react";

const navItems = [
  { to: "/app/conferences", label: "Конференции", icon: CalendarDays },
  { to: "/app/notes", label: "Конспекты", icon: FileText },
  { to: "/app/upload", label: "Загрузка файлов", icon: Upload },
];

export function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        background: "rgba(15, 23, 42, 0.95)",
        borderRight: "1px solid var(--border-subtle)",
        backdropFilter: "blur(18px)",
        padding: "18px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: 0.6,
          padding: "4px 10px 14px 10px",
        }}
      >

      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 999,
              fontSize: 14,
              color: isActive ? "#e5e7eb" : "var(--text-muted)",
              background: isActive ? "var(--accent-soft)" : "transparent",
              border: isActive ? "1px solid rgba(99,102,241,0.55)" : "1px solid transparent",
              cursor: "pointer",
              transition: "all 0.18s ease",
            })}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
