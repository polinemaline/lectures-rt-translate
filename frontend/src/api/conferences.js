// frontend/src/api/conferences.js

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

// -----------------------------
// REST: create/join
// -----------------------------
export async function createConference(title) {
  const r = await fetch(apiUrl("/api/conferences/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function joinConference(code) {
  const r = await fetch(apiUrl("/api/conferences/join"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

// -----------------------------
// WS URL helper
// -----------------------------
export function conferenceWsUrl(code) {
  // http://localhost:8000 -> ws://localhost:8000
  const u = new URL(API_BASE);
  const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${u.host}/api/conferences/${encodeURIComponent(
    code
  )}/ws`;
}

// -----------------------------
// Translate one segment (REST)
// -----------------------------
export async function translateSegment(text, src_lang, tgt_lang) {
  const r = await fetch(apiUrl("/api/conferences/translate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, src_lang, tgt_lang }),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json(); // { translated: "..." }
}

// -----------------------------
// Export download (opens new tab)
// -----------------------------
export function downloadExport(code, format, src_lang, tgt_lang, translated_text) {
  const qs = new URLSearchParams({
    format,
    src_lang,
    tgt_lang,
    translated_text,
  }).toString();

  window.open(
    apiUrl(`/api/conferences/${encodeURIComponent(code)}/export?${qs}`),
    "_blank"
  );
}
