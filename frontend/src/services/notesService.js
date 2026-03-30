import { apiFetch } from "../api/client";

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchNotes(token) {
  return await apiFetch("/api/notes", {
    headers: {
      ...authHeaders(token),
    },
  });
}

export async function createNote(payload, token) {
  return await apiFetch("/api/notes", {
    method: "POST",
    headers: {
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export async function updateNote(noteId, payload, token) {
  return await apiFetch(`/api/notes/${noteId}`, {
    method: "PUT",
    headers: {
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteNote(noteId, token) {
  return await apiFetch(`/api/notes/${noteId}`, {
    method: "DELETE",
    headers: {
      ...authHeaders(token),
    },
  });
}

export async function downloadNoteExport(noteId, format, token) {
  const base = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE ||
    ""
  ).replace(/\/$/, "");
  const url = `${base}/api/notes/${noteId}/export?format=${format}`;

  const res = await fetch(url, {
    headers: {
      ...authHeaders(token),
    },
    credentials: "include",
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) {
        msg =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail);
      } else {
        msg = JSON.stringify(data);
      }
    } catch {
      try {
        msg = await res.text();
      } catch {
        // ignore
      }
    }
    throw new Error(msg || "Не удалось скачать файл");
  }

  const blob = await res.blob();
  const a = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);

  a.href = objectUrl;
  a.download = `note_${noteId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(objectUrl);
}
