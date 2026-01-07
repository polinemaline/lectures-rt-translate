// frontend/src/api/conferences.js
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let text = await res.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.detail || "Ошибка запроса");
    } catch {
      throw new Error(text || "Ошибка запроса");
    }
  }

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
