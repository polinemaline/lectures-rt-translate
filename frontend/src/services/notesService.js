// frontend/src/services/notesService.js

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchNotes(token) {
  const res = await fetch(`${API_BASE}/api/notes`, {
    headers: { ...authHeaders(token) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Не удалось загрузить конспекты");
  }
  return res.json();
}

export async function createNote(payload, token) {
  const res = await fetch(`${API_BASE}/api/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Не удалось сохранить конспект");
  }
  return res.json();
}

export async function updateNote(noteId, payload, token) {
  const res = await fetch(`${API_BASE}/api/notes/${noteId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Не удалось обновить конспект");
  }
  return res.json();
}

export async function deleteNote(noteId, token) {
  const res = await fetch(`${API_BASE}/api/notes/${noteId}`, {
    method: "DELETE",
    headers: { ...authHeaders(token) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Не удалось удалить конспект");
  }
  return res.json();
}

export function downloadNoteExport(noteId, format, token) {
  const url = `${API_BASE}/api/notes/${noteId}/export?format=${format}`;
  return fetch(url, { headers: { ...authHeaders(token) } })
    .then(async (res) => {
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Не удалось скачать файл");
      }
      return res.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `note_${noteId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    });
}
