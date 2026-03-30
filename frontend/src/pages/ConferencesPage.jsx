import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createConference, joinConference } from "../api/conferences";

const LANGS = [
  { code: "eng_Latn", label: "English" },
  { code: "deu_Latn", label: "Deutsch" },
  { code: "fra_Latn", label: "Français" },
  { code: "spa_Latn", label: "Español" },
  { code: "ita_Latn", label: "Italiano" },
  { code: "por_Latn", label: "Português" },
  { code: "tur_Latn", label: "Türkçe" },
];

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

function saveConferenceToStorage(conf) {
  try {
    if (!conf?.code) return;
    localStorage.setItem(`conference:${conf.code}`, JSON.stringify(conf));
  } catch {
    // ignore
  }
}

export function ConferencesPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [createdConference, setCreatedConference] = useState(null);

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinLang, setJoinLang] = useState("eng_Latn");

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreatedConference(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setCreateError("Введите название конференции");
      return;
    }

    try {
      const conf = await createConference(trimmedTitle);
      setCreatedConference(conf);
      setTitle("");
    } catch (err) {
      console.error("create conference error:", err);
      setCreateError(
        err.message || "Не удалось создать конференцию.\nПопробуйте ещё раз."
      );
    }
  };

  const handleConnectCreated = () => {
    if (!createdConference?.code) return;

    const confForRoom = {
      ...createdConference,
      title: createdConference.title ?? "Конференция",
      is_organizer: true,
      target_language: "eng_Latn",
      src_language: "rus_Cyrl",
    };

    saveConferenceToStorage(confForRoom);

    navigate(`/conference/${createdConference.code}?role=organizer`, {
      state: { conference: confForRoom },
    });
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setJoinError("");

    const trimmed = joinCode.trim();
    if (!trimmed) {
      setJoinError("Введите код конференции");
      return;
    }

    try {
      const conf = await joinConference(trimmed);

      const confForRoom = {
        ...conf,
        title: conf.title ?? "Конференция",
        is_organizer: false,
        target_language: joinLang,
        src_language: "rus_Cyrl",
      };

      saveConferenceToStorage(confForRoom);

      navigate(`/conference/${conf.code}?role=participant`, {
        state: { conference: confForRoom },
      });
    } catch (err) {
      console.error("join conference error:", err);
      setJoinError(
        err.message || "Не удалось подключиться.\nПроверьте код и попробуйте снова."
      );
    }
  };

  return (
    <div className="page-inner">
      <h1 className="page-title">Конференции</h1>

      <div style={{ display: "grid", gap: 18 }}>
        <section className="conference-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Создать конференцию</h2>
          <p style={{ color: "#9ca3af", marginTop: -6 }}>
            Введите название конференции. После создания вы получите уникальный код.
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
                style={fieldStyle}
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
              >
                Создать конференцию
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
              <div className="conference-message conference-message_success">
                Конференция создана. Код: <b>{createdConference.code}</b>
              </div>
            )}
          </form>
        </section>

        <section className="conference-card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Подключиться к конференции</h2>
          <p style={{ color: "#9ca3af", marginTop: -6 }}>
            Введите код конференции.
          </p>

          <form onSubmit={handleJoin} style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ marginBottom: 8, color: "#cbd5e1" }}>Код конференции</div>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Например: AB12CD34"
                style={fieldStyle}
              />
            </div>

            <div>
              <div style={{ marginBottom: 8, color: "#cbd5e1" }}>Язык перевода</div>
              <select
                value={joinLang}
                onChange={(e) => setJoinLang(e.target.value)}
                style={selectStyle}
              >
                {LANGS.map((l) => (
                  <option
                    key={l.code}
                    value={l.code}
                    style={{ color: "#e5eefc", background: "#0f172a" }}
                  >
                    {l.label}
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
              >
                Подключиться
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
