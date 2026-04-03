import { apiFetch } from "./client";

const API_BASE = (
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || ""
).replace(/\/$/, "");

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

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

export function conferenceWsUrl(code) {
  const base = API_BASE || window.location.origin;
  const url = new URL(base);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}/api/conferences/${encodeURIComponent(code)}/ws`;
}

export function defaultIceServers() {
  const stunUrl = (import.meta.env.VITE_STUN_URL || "").trim();
  const turnUrl = (import.meta.env.VITE_TURN_URL || "").trim();
  const turnUsername = (import.meta.env.VITE_TURN_USERNAME || "").trim();
  const turnCredential = (import.meta.env.VITE_TURN_CREDENTIAL || "").trim();

  const servers = [];

  servers.push({
    urls: stunUrl || "stun:stun.l.google.com:19302",
  });

  if (turnUrl) {
    const turnServer = { urls: turnUrl };
    if (turnUsername) turnServer.username = turnUsername;
    if (turnCredential) turnServer.credential = turnCredential;
    servers.push(turnServer);
  }

  return servers;
}

export async function translateSegment(text, src_lang, tgt_lang) {
  return await apiFetch("/api/conferences/translate", {
    method: "POST",
    body: JSON.stringify({ text, src_lang, tgt_lang }),
  });
}

export function downloadExport(
  code,
  format,
  src_lang,
  tgt_lang,
  original_text,
  translated_text,
) {
  const queryString = new URLSearchParams({
    format,
    src_lang,
    tgt_lang,
    original_text: original_text || "",
    translated_text: translated_text || "",
  }).toString();

  window.open(
    apiUrl(`/api/conferences/${encodeURIComponent(code)}/export?${queryString}`),
    "_blank",
  );
}
