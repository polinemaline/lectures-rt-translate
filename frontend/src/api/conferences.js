// frontend/src/api/conferences.js

import { apiFetch } from "./client";

// Prefer VITE_API_URL / VITE_API_BASE. If not set, use same-origin.
// This keeps dev and Docker behaviour consistent (when nginx proxies /api to backend).
const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

function apiUrl(path) {
  // If API_BASE is empty -> same origin
  return `${API_BASE}${path}`;
}

// -----------------------------
// REST: create/join
// -----------------------------
export async function createConference(title) {
  return await apiFetch("/api/conferences/create", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function joinConference(code) {
  return await apiFetch("/api/conferences/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// -----------------------------
// WS URL helper
// -----------------------------
export function conferenceWsUrl(code) {
  // If API_BASE is set to an absolute URL -> use it.
  // Otherwise use the current origin so WS works behind nginx.
  const base = API_BASE || window.location.origin;
  const u = new URL(base);
  const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${u.host}/api/conferences/${encodeURIComponent(code)}/ws`;
}

// -----------------------------
// Translate one segment (REST)
// -----------------------------
export async function translateSegment(text, src_lang, tgt_lang) {
  return await apiFetch("/api/conferences/translate", {
    method: "POST",
    body: JSON.stringify({ text, src_lang, tgt_lang }),
  }); // { translated: "..." }
}

// -----------------------------
// Export download (opens new tab)
// Передаём то, что участник ВИДИТ: original_text и translated_text
// -----------------------------
export function downloadExport(
  code,
  format,
  src_lang,
  tgt_lang,
  original_text,
  translated_text
) {
  const qs = new URLSearchParams({
    format,
    src_lang,
    tgt_lang,
    original_text: original_text || "",
    translated_text: translated_text || "",
  }).toString();

  window.open(apiUrl(`/api/conferences/${encodeURIComponent(code)}/export?${qs}`), "_blank");
}
