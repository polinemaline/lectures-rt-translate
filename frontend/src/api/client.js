// frontend/src/api/client.js
const BASE = ""; // если nginx проксирует /api на backend — оставляем пусто

function getToken() {
  return localStorage.getItem("token"); // или как у вас хранится
}

export async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...options, headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || res.statusText || "Request failed");
  }
  return res.json();
}

export async function apiUpload(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || res.statusText || "Upload failed");
  }
  return res.json();
}
