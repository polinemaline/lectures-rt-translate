// src/api/conferences.js

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let message = `Ошибка запроса (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) {
        message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export async function createConference(title) {
  return request("/api/conferences/create", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function joinConference(code) {
  return request("/api/conferences/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
