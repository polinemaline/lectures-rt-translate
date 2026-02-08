// frontend/src/api/client.js
// Small fetch wrapper with optional base URL.
// In dev you can keep same-origin; in Docker you can set VITE_API_URL (e.g. http://localhost:8080)

const BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

async function parseError(res) {
  try {
    const data = await res.json();
    if (data?.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    return JSON.stringify(data);
  } catch {
    try {
      return await res.text();
    } catch {
      return `HTTP ${res.status}`;
    }
  }
}

export async function apiFetch(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const msg = await parseError(res);
    throw new Error(msg || `HTTP ${res.status}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}
