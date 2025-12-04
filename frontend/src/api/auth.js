// frontend/src/api/auth.js

const API_BASE = "http://localhost:8000/api";

async function handleResponse(res) {
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // тело пустое или не JSON — не страшно
    data = null;
  }

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) ||
      (Array.isArray(data?.detail) ? data.detail[0]?.msg : null);

    throw new Error(detail || `Ошибка ${res.status}`);
  }

  return data;
}

export async function loginApi(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return handleResponse(res);
}

export async function registerApi(email, password, password_confirm, full_name) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, password_confirm, full_name }),
  });

  return handleResponse(res);
}
