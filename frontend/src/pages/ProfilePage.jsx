import { useAuth } from "../auth/AuthContext";

export function ProfilePage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Профиль</h1>
      <div
        style={{
          borderRadius: 18,
          padding: 18,
          border: "1px solid var(--border-subtle)",
          background: "rgba(15,23,42,0.8)",
          maxWidth: 420,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Имя</div>
          <div style={{ fontSize: 15 }}>{user?.name || "—"}</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>E-mail</div>
          <div style={{ fontSize: 15 }}>{user?.email || "—"}</div>
        </div>

        {/* тут позже можно добавить смену пароля, языка интерфейса и т.д. */}
      </div>
    </div>
  );
}
