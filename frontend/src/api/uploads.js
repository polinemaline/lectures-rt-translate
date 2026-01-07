// frontend/src/api/uploads.js
import { apiFetch, apiUpload } from "./client";

// 1) загрузка файла
export async function uploadMedia(file) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload("/api/uploads", form);
}

// 2) языки
export async function getUploadLanguages() {
  return apiFetch("/api/uploads/languages");
}

// 3) старт перевода
export async function startUploadJob(jobId, target_language) {
  return apiFetch(`/api/uploads/${jobId}/start`, {
    method: "POST",
    body: JSON.stringify({ target_language }),
  });
}

// 4) статус
export async function getUploadStatus(jobId) {
  return apiFetch(`/api/uploads/${jobId}/status`);
}

// 5) ссылки для скачивания
export function getDownloadUrl(jobId, format) {
  return `/api/uploads/${jobId}/download?format=${format}`;
}

// 6) заглушка сохранить
export async function saveAsNote(jobId) {
  return apiFetch(`/api/uploads/${jobId}/save-note`, { method: "POST" });
}
