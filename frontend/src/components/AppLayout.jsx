import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background:
          "radial-gradient(circle at top, #020617 0, #020617 45%, #000 100%)",
        color: "var(--text)",
      }}
    >
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <main
          style={{
            flex: 1,
            padding: 20,
            overflow: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
