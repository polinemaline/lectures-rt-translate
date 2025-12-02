export function ConferencesPage() {
  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Конференции</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 18 }}>
        Здесь можно создавать и запускать конференции с онлайн-переводом.
      </p>

      <div
        style={{
          borderRadius: 18,
          padding: 18,
          border: "1px solid var(--border-subtle)",
          background: "rgba(15,23,42,0.8)",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            marginBottom: 10,
          }}
        >
          Создать конференцию
        </div>
        {/* Пока просто заглушка. Потом сюда добавим форму. */}
        <button
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "none",
            background:
              "linear-gradient(135deg, #6366f1, #22c55e)",
            color: "white",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Новая конференция
        </button>
      </div>
    </div>
  );
}
