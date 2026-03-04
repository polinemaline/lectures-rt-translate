// frontend/src/services/uploadsService.js

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchUploadLanguages(token) {
  const res = await fetch(`${API_BASE}/api/uploads/languages`, {
    headers: { ...authHeaders(token) },
  });
  if (!res.ok) throw new Error("Не удалось получить список языков");
  return res.json();
}

export async function uploadMediaFile(file, token) {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    headers: { ...authHeaders(token) },
    body: fd,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Ошибка загрузки файла");
  }
  return res.json(); // {id, status, progress}
}

export async function startUploadJob(jobId, targetLanguage, token) {
  const res = await fetch(`${API_BASE}/api/uploads/${jobId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify({ target_language: targetLanguage }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Не удалось запустить обработку");
  }
  return res.json();
}

export async function fetchJobStatus(jobId, token) {
  const res = await fetch(`${API_BASE}/api/uploads/${jobId}/status`, {
    headers: { ...authHeaders(token) },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Не удалось получить статус");
  }
  return res.json(); // {id,status,stage,progress,error_message}
}

export function downloadJobResult(jobId, format, token) {
  const url = `${API_BASE}/api/uploads/${jobId}/download?format=${format}`;

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
      a.download = `translation_${jobId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    });
}

export async function saveUploadToNotes(jobId, token) {
  const res = await fetch(`${API_BASE}/api/uploads/${jobId}/save-note`, {
    method: "POST",
    headers: { ...authHeaders(token) },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || "Не удалось сохранить в конспекты");
  }
  return res.json(); // {ok, note_id, message}
}
