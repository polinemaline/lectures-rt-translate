import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createConference, joinConference } from "../api/conferences";
import { useAuth } from "../auth/AuthContext";

const LANGS = [
  { code: "eng_Latn", label: "English" },
  { code: "deu_Latn", label: "Deutsch" },
  { code: "fra_Latn", label: "Français" },
  { code: "spa_Latn", label: "Español" },
  { code: "ita_Latn", label: "Italiano" },
  { code: "por_Latn", label: "Português" },
  { code: "tur_Latn", label: "Türkçe" },
];

const inputStyle = {
  width: "100%",
  minHeight: 42,
  borderRadius: 999,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.62)",
  color: "#e5eefc",
  padding: "0 14px",
  outline: "none",
  font: "inherit",
  boxSizing: "border-box",
};

const selectStyle = {
  ...inputStyle,
  appearance: "none",
};

const secondaryButtonStyle = {
  minHeight: 42,
  borderRadius: 999,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.62)",
  color: "#e5eefc",
  padding: "0 18px",
  fontWeight: 600,
  cursor: "pointer",
};

const codeWrapStyle = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const codeFieldStyle = {
  ...inputStyle,
  flex: 1,
  minWidth: 220,
  letterSpacing: "0.18em",
  fontWeight: 700,
  textTransform: "uppercase",
  textAlign: "center",
};

const iconButtonStyle = {
  width: 42,
  minWidth: 42,
  height: 42,
  borderRadius: "50%",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.62)",
  color: "#e5eefc",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function storageKeyForConference(code) {
  return `conference:${code}`;
}

function saveConferenceToStorage(conf) {
  try {
    if (!conf?.code) return;
    const raw = JSON.stringify(conf);
    window.sessionStorage.setItem(storageKeyForConference(conf.code), raw);
    window.localStorage.setItem(storageKeyForConference(conf.code), raw);
  } catch {
    // ignore storage errors
  }
}

function CopyIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="9"
        y="9"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ConferencesPage() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createdConference, setCreatedConference] = useState(null);

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinLang, setJoinLang] = useState("eng_Latn");

  const [copySuccess, setCopySuccess] = useState("");

  const createdCode = useMemo(
    () => String(createdConference?.code || "").trim().toUpperCase(),
    [createdConference],
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCopySuccess("");

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setCreateError("Введите название конференции");
      return;
    }

    try {
      setCreateBusy(true);
      const conf = await createConference(trimmedTitle, token);

      const confForRoom = {
        ...conf,
        title: conf.title ?? trimmedTitle,
        is_organizer: true,
        target_language: "eng_Latn",
        src_language: "rus_Cyrl",
      };

      saveConferenceToStorage(confForRoom);
      setCreatedConference(confForRoom);
      setTitle("");
    } catch (err) {
      console.error("create conference error:", err);
      setCreateError(
        err.message || "Не удалось создать конференцию.\nПопробуйте ещё раз.",
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const handleConnectCreated = () => {
    if (!createdConference?.code) return;

    navigate(`/conference/${createdConference.code}?role=organizer`, {
      state: { conference: createdConference },
    });
  };

  const handleCopyCreatedCode = async () => {
    if (!createdCode) return;

    try {
      await navigator.clipboard.writeText(createdCode);
      setCopySuccess("Код скопирован");
      window.setTimeout(() => setCopySuccess(""), 1800);
    } catch (error) {
      console.error(error);
      setCopySuccess("Не удалось скопировать код");
      window.setTimeout(() => setCopySuccess(""), 1800);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setJoinError("");

    const trimmed = joinCode.trim().toUpperCase();
    if (!trimmed) {
      setJoinError("Введите код конференции");
      return;
    }

    try {
      setJoinBusy(true);
      const conf = await joinConference(trimmed, token);
      const shouldJoinAsOrganizer = Boolean(conf?.can_join_as_organizer);

      const confForRoom = {
        ...conf,
        title: conf.title ?? "Конференция",
        is_organizer: shouldJoinAsOrganizer,
        target_language: joinLang,
        src_language: "rus_Cyrl",
      };

      saveConferenceToStorage(confForRoom);

      navigate(
        `/conference/${conf.code}?role=${shouldJoinAsOrganizer ? "organizer" : "participant"}`,
        {
          state: { conference: confForRoom },
        },
      );
    } catch (err) {
      console.error("join conference error:", err);
      setJoinError(
        err.message || "Не удалось подключиться.\nПроверьте код и попробуйте снова.",
      );
    } finally {
      setJoinBusy(false);
    }
  };

  return (
    <div className="page-inner">
      <h1 className="page-title">Конференции</h1>

      <div style={{ display: "grid", gap: 18 }}>
        <section className="conference-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Создать конференцию</h2>
          <p style={{ color: "#9ca3af", marginTop: -6 }}>
            Введите название конференции. После создания вы получите уникальный код
            и сможете подключиться как организатор сразу или позже.
          </p>

          <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ marginBottom: 8, color: "#cbd5e1" }}>
                Название конференции
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Лекция по математике"
                style={inputStyle}
              />
            </div>

            {createError && (
              <div className="conference-message conference-message_error">
                {createError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="submit"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                disabled={createBusy}
              >
                {createBusy ? "Создаём..." : "Создать конференцию"}
              </button>

              {createdConference && (
                <button
                  type="button"
                  className="conference-secondary-btn"
                  style={secondaryButtonStyle}
                  onClick={handleConnectCreated}
                >
                  Подключиться как организатор
                </button>
              )}
            </div>

            {createdConference && (
              <div
                className="conference-message conference-message_success"
                style={{ display: "grid", gap: 10 }}
              >
                <div>Конференция создана.</div>

                <div style={codeWrapStyle}>
                  <input
                    readOnly
                    value={createdCode}
                    style={codeFieldStyle}
                    aria-label="Код конференции"
                  />

                  <button
                    type="button"
                    onClick={handleCopyCreatedCode}
                    style={iconButtonStyle}
                    title="Скопировать код"
                    aria-label="Скопировать код"
                  >
                    <CopyIcon />
                  </button>
                </div>

                {copySuccess && <div>{copySuccess}</div>}
              </div>
            )}
          </form>
        </section>

        <section className="conference-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Подключиться к конференции</h2>
          <p style={{ color: "#9ca3af", marginTop: -6 }}>
            Введите код конференции. Если вы создатель этой конференции, система
            автоматически подключит вас как организатора.
          </p>

          <form onSubmit={handleJoin} style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ marginBottom: 8, color: "#cbd5e1" }}>
                Код конференции
              </div>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Например: AB12CD34"
                style={{
                  ...inputStyle,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              />
            </div>

            <div>
              <div style={{ marginBottom: 8, color: "#cbd5e1" }}>
                Язык перевода
              </div>
              <select
                value={joinLang}
                onChange={(e) => setJoinLang(e.target.value)}
                style={selectStyle}
              >
                {LANGS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {joinError && (
              <div className="conference-message conference-message_error">
                {joinError}
              </div>
            )}

            <div>
              <button
                type="submit"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                disabled={joinBusy}
              >
                {joinBusy ? "Подключаем..." : "Подключиться"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
