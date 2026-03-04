// frontend/src/pages/UploadsPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchUploadLanguages,
  uploadMediaFile,
  startUploadJob,
  fetchJobStatus,
  downloadJobResult,
  saveUploadToNotes,
} from "../services/uploadsService";

function prettyStage(stage) {
  const map = {
    uploaded: "Файл загружен",
    extract: "Извлечение аудио",
    transcribe: "Распознавание речи",
    translate: "Перевод",
    export: "Подготовка файлов",
    done: "Готово",
    error: "Ошибка",
  };
  return map[stage] || stage || "—";
}

export function UploadsPage() {
  const { token } = useAuth();

  const [file, setFile] = useState(null);
  const [languages, setLanguages] = useState([]);
  const [langLoading, setLangLoading] = useState(false);

  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);

  const [showLangModal, setShowLangModal] = useState(false);
  const [selectedLang, setSelectedLang] = useState("");

  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");

  const pollRef = useRef(null);

  const allowedHint = useMemo(() => "mp3, wav, m4a, mp4, webm, mov", []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLangLoading(true);
        const data = await fetchUploadLanguages(token);
        if (!alive) return;
        setLanguages(data);
        if (data?.length) setSelectedLang(data[0].code);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLangLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const startPolling = (id) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const st = await fetchJobStatus(id, token);
        setStatus(st);
        if (st.status === "done" || st.status === "error") {
          stopPolling();
        }
      } catch (e) {
        console.error(e);
      }
    }, 900);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const resetMessages = () => {
    setUiError("");
    setUiSuccess("");
  };

  const resetAll = () => {
    stopPolling();
    setFile(null);
    setJobId(null);
    setStatus(null);
    setShowLangModal(false);
    resetMessages();
  };

  const handlePickFile = (e) => {
    resetMessages();
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  const handleUpload = async () => {
    resetMessages();
    if (!file) {
      setUiError("Выберите файл для загрузки");
      return;
    }
    try {
      setBusy(true);
      const res = await uploadMediaFile(file, token);
      setJobId(res.id);
      setStatus({ status: res.status, stage: "uploaded", progress: res.progress });
      setShowLangModal(true);
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    resetMessages();
    if (!jobId) return;
    try {
      setBusy(true);
      await startUploadJob(jobId, selectedLang, token);
      setShowLangModal(false);
      setUiSuccess("Обработка началась");
      startPolling(jobId);
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось запустить обработку");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (format) => {
    resetMessages();
    if (!jobId) return;
    try {
      setBusy(true);
      await downloadJobResult(jobId, format, token);
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось скачать файл");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNote = async () => {
    resetMessages();
    if (!jobId) return;
    try {
      setBusy(true);
      const res = await saveUploadToNotes(jobId, token);
      setUiSuccess(res.message || "Сохранено в конспекты");
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const isDone = status?.status === "done";
  const isError = status?.status === "error";
  const progress = Math.min(Math.max(status?.progress ?? 0, 0), 100);

  return (
    <div className="page-inner">
      <h1 className="page-title">Загрузки</h1>
      <p style={{ marginTop: -12, color: "#9ca3af" }}>
        Загрузите аудио/видео и получите перевод в PDF/DOCX.
      </p>

      {/* Карточка теперь идет под заголовком и НЕ уезжает вправо */}
      <div className="uploads-card" style={{ marginTop: 18 }}>
        <div className="uploads-label">Файл (поддерживаемые: {allowedHint})</div>

        <input type="file" onChange={handlePickFile} disabled={busy} />

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="conference-primary-btn" onClick={handleUpload} disabled={busy || !file}>
            Загрузить
          </button>
          <button className="conference-secondary-btn" onClick={resetAll} disabled={busy}>
            Сбросить
          </button>
        </div>

        {file && (
          <div style={{ marginTop: 10, color: "#9ca3af", fontSize: 13 }}>
            Выбран файл: <b>{file.name}</b>
          </div>
        )}

        {(jobId || status) && (
          <div className="uploads-section" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#9ca3af", fontSize: 13 }}>Задача</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>#{jobId}</div>
              </div>

              <div>
                <div style={{ color: "#9ca3af", fontSize: 13 }}>Этап</div>
                <div style={{ fontSize: 14 }}>{prettyStage(status?.stage)}</div>
              </div>

              <div>
                <div style={{ color: "#9ca3af", fontSize: 13 }}>Статус</div>
                <div style={{ fontSize: 14 }}>
                  {isDone ? "Готово" : isError ? "Ошибка" : "В процессе"} • {progress}%
                </div>
              </div>
            </div>

            {status?.error_message && (
              <div className="conference-message conference-message_error" style={{ marginTop: 12 }}>
                {status.error_message}
              </div>
            )}

            {isDone && (
              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="conference-secondary-btn" onClick={() => handleDownload("docx")} disabled={busy}>
                  Скачать DOCX
                </button>
                <button className="conference-secondary-btn" onClick={() => handleDownload("pdf")} disabled={busy}>
                  Скачать PDF
                </button>
                <button className="conference-primary-btn" onClick={handleSaveNote} disabled={busy}>
                  Сохранить в конспекты
                </button>
              </div>
            )}
          </div>
        )}

        {uiError && (
          <div className="conference-message conference-message_error" style={{ marginTop: 14 }}>
            {uiError}
          </div>
        )}
        {uiSuccess && (
          <div className="conference-message conference-message_success" style={{ marginTop: 14 }}>
            {uiSuccess}
          </div>
        )}
      </div>

      {showLangModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div className="conference-card" style={{ width: "100%", maxWidth: 520, position: "relative" }}>
            <button
              onClick={() => setShowLangModal(false)}
              aria-label="Закрыть"
              disabled={busy}
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                border: "none",
                background: "transparent",
                color: "#9ca3af",
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ✕
            </button>

            <h2 style={{ marginTop: 0 }}>Выберите язык перевода</h2>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, color: "#d1d5db", marginBottom: 6 }}>Язык</div>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                disabled={busy || langLoading}
                className="conference-input"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="conference-primary-btn" onClick={handleStart} disabled={busy || !selectedLang}>
                Начать перевод
              </button>
              <button className="conference-secondary-btn" onClick={() => setShowLangModal(false)} disabled={busy}>
                Отмена
              </button>
            </div>

            <p style={{ marginTop: 14, color: "#9ca3af", fontSize: 12 }}>
              Если языков мало — позже расширим список.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
