// frontend/src/pages/UploadsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  fetchUploadLanguages,
  uploadMediaFile,
  startUploadJob,
  fetchJobStatus,
  downloadJobResult,
  saveNoteStub,
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
  const { token } = useAuth(); // у вас токен есть (mock-token-...)
  const [file, setFile] = useState(null);

  const [languages, setLanguages] = useState([]);
  const [langLoading, setLangLoading] = useState(false);

  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null); // {status,stage,progress,error_message}

  const [showLangModal, setShowLangModal] = useState(false);
  const [selectedLang, setSelectedLang] = useState("");
  const [busy, setBusy] = useState(false);

  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");

  const pollRef = useRef(null);

  const allowedHint = useMemo(
    () => "mp3, wav, m4a, mp4, webm, mov",
    []
  );

  // ---- загружаем языки при открытии страницы ----
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

  // ---- polling статуса ----
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
      const res = await saveNoteStub(jobId, token);
      setUiSuccess(res.message || "Сохранено (заглушка)");
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
    <div className="uploads-page">
      <div className="uploads-card">
        <div className="uploads-head">
          <h1 className="uploads-title">Загрузки</h1>
          <p className="uploads-subtitle">
            Загрузите аудио/видео и получите перевод в PDF/DOCX.
          </p>
        </div>

        <div className="uploads-section">
          <label className="uploads-label">Файл (поддерживаемые: {allowedHint})</label>
          <div className="uploads-row">
            <input
              type="file"
              className="uploads-file"
              onChange={handlePickFile}
              accept=".mp3,.wav,.m4a,.mp4,.webm,.mov"
              disabled={busy}
            />
            <button
              className="uploads-btn uploads-btn_primary"
              onClick={handleUpload}
              disabled={busy || !file}
            >
              Загрузить
            </button>
            <button
              className="uploads-btn uploads-btn_ghost"
              onClick={resetAll}
              disabled={busy}
            >
              Сбросить
            </button>
          </div>

          {file && (
            <p className="uploads-hint">
              Выбран файл: <span className="uploads-mono">{file.name}</span>
            </p>
          )}
        </div>

        {(jobId || status) && (
          <div className="uploads-section">
            <div className="uploads-status-head">
              <div>
                <div className="uploads-status-line">
                  <span className="uploads-muted">Задача:</span>{" "}
                  <span className="uploads-mono">#{jobId}</span>
                </div>
                <div className="uploads-status-line">
                  <span className="uploads-muted">Этап:</span>{" "}
                  <span>{prettyStage(status?.stage)}</span>
                </div>
              </div>

              <div className="uploads-pill">
                {isDone ? "Готово" : isError ? "Ошибка" : "В процессе"}
              </div>
            </div>

            <div className="uploads-progress">
              <div className="uploads-progress-bar">
                <div
                  className="uploads-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="uploads-progress-meta">
                <span className="uploads-mono">{progress}%</span>
                <span className="uploads-muted">{status?.status || ""}</span>
              </div>
            </div>

            {status?.error_message && (
              <div className="uploads-alert uploads-alert_error">
                {status.error_message}
              </div>
            )}

            {isDone && (
              <div className="uploads-actions">
                <button
                  className="uploads-btn uploads-btn_primary"
                  onClick={() => handleDownload("docx")}
                  disabled={busy}
                >
                  Скачать DOCX
                </button>
                <button
                  className="uploads-btn uploads-btn_primary"
                  onClick={() => handleDownload("pdf")}
                  disabled={busy}
                >
                  Скачать PDF
                </button>
                <button
                  className="uploads-btn uploads-btn_ghost"
                  onClick={handleSaveNote}
                  disabled={busy}
                >
                  Сохранить в конспекты (заглушка)
                </button>
              </div>
            )}
          </div>
        )}

        {uiError && <div className="uploads-alert uploads-alert_error">{uiError}</div>}
        {uiSuccess && (
          <div className="uploads-alert uploads-alert_success">{uiSuccess}</div>
        )}
      </div>

      {/* ====== Модалка выбора языка ====== */}
      {showLangModal && (
        <div className="uploads-modal-backdrop" onMouseDown={() => {}}>
          <div className="uploads-modal" role="dialog" aria-modal="true">
            <div className="uploads-modal-head">
              <h2 className="uploads-modal-title">Выберите язык перевода</h2>
              <button
                className="uploads-modal-close"
                onClick={() => setShowLangModal(false)}
                aria-label="Закрыть"
                disabled={busy}
              >
                ✕
              </button>
            </div>

            <p className="uploads-modal-subtitle">
              Доступные языки зависят от выбранной модели перевода.
            </p>

            <div className="uploads-modal-body">
              <label className="uploads-label">Язык</label>
              <select
                className="uploads-select"
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                disabled={busy || langLoading}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>

              <div className="uploads-modal-actions">
                <button
                  className="uploads-btn uploads-btn_primary"
                  onClick={handleStart}
                  disabled={busy || !selectedLang}
                >
                  Начать перевод
                </button>
                <button
                  className="uploads-btn uploads-btn_ghost"
                  onClick={() => setShowLangModal(false)}
                  disabled={busy}
                >
                  Отмена
                </button>
              </div>

              <p className="uploads-hint">
                Если языков мало — позже расширим список.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
