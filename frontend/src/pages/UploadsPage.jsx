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

function getLangText(lang) {
  return lang?.name || lang?.label || lang?.code || "—";
}

const secondaryButtonStyle = {
  minHeight: 40,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.62)",
  color: "#e5eefc",
  padding: "0 16px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const fieldStyle = {
  width: "100%",
  minHeight: 42,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.62)",
  color: "#e5eefc",
  padding: "0 14px",
  outline: "none",
  font: "inherit",
  boxSizing: "border-box",
};

const selectStyle = {
  ...fieldStyle,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  colorScheme: "dark",
};

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
      setStatus({
        status: res.status,
        stage: "uploaded",
        progress: res.progress,
      });
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

      <p style={{ color: "#9ca3af", marginTop: -8, marginBottom: 18 }}>
        Загрузите аудио/видео и получите перевод в PDF/DOCX.
      </p>

      <div className="conference-card" style={{ padding: 18 }}>
        <div style={{ marginBottom: 10, color: "#cbd5e1" }}>
          Файл (поддерживаемые: {allowedHint})
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label
            className="conference-secondary-btn"
            style={{ ...secondaryButtonStyle, cursor: "pointer" }}
          >
            Выбрать файл
            <input
              type="file"
              accept=".mp3,.wav,.m4a,.mp4,.webm,.mov"
              onChange={handlePickFile}
              style={{ display: "none" }}
            />
          </label>

          <button
            type="button"
            className="conference-secondary-btn"
            style={secondaryButtonStyle}
            onClick={handleUpload}
            disabled={busy}
          >
            Загрузить
          </button>

          <button
            type="button"
            className="conference-secondary-btn"
            style={secondaryButtonStyle}
            onClick={resetAll}
            disabled={busy}
          >
            Сбросить
          </button>
        </div>

        {file && (
          <div style={{ marginTop: 12, color: "#cbd5e1" }}>
            Выбран файл: <b>{file.name}</b>
          </div>
        )}

        {(jobId || status) && (
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 16,
              border: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(2,6,23,0.34)",
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>Задача</div>
              <div style={{ fontWeight: 700 }}>#{jobId}</div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ color: "#9ca3af", fontSize: 13 }}>Этап</div>
                <div>{prettyStage(status?.stage)}</div>
              </div>

              <div>
                <div style={{ color: "#9ca3af", fontSize: 13 }}>Статус</div>
                <div>
                  {isDone ? "Готово" : isError ? "Ошибка" : "В процессе"} •{" "}
                  {progress}%
                </div>
              </div>

              <div
                style={{
                  width: "100%",
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(148,163,184,0.14)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #60a5fa, #34d399)",
                  }}
                />
              </div>

              {status?.error_message && (
                <div className="conference-message conference-message_error">
                  {status.error_message}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={() => handleDownload("pdf")}
                disabled={!isDone || busy}
              >
                PDF
              </button>

              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={() => handleDownload("docx")}
                disabled={!isDone || busy}
              >
                DOCX
              </button>

              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={handleSaveNote}
                disabled={!isDone || busy}
              >
                Сохранить на сайте
              </button>
            </div>
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
            zIndex: 1200,
            background: "rgba(2, 6, 23, 0.74)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            className="conference-card"
            style={{
              width: "100%",
              maxWidth: 520,
              padding: 20,
            }}
          >
            <h2 style={{ marginTop: 0 }}>Язык перевода</h2>

            <p style={{ color: "#9ca3af", marginTop: -6 }}>
              Выберите язык, на который нужно перевести материал.
            </p>

            <div style={{ marginTop: 12 }}>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                style={selectStyle}
                disabled={langLoading || busy}
              >
                {languages.map((lang) => (
                  <option
                    key={lang.code}
                    value={lang.code}
                    style={{ color: "#e5eefc", background: "#0f172a" }}
                  >
                    {getLangText(lang)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={handleStart}
                disabled={busy || langLoading}
              >
                Начать обработку
              </button>

              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={() => setShowLangModal(false)}
                disabled={busy}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
