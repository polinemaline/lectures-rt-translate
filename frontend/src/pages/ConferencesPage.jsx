// frontend/src/pages/ConferencesPage.jsx
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

  // создание конференции
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [createdConference, setCreatedConference] = useState(null);

  // подключение по коду
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

  // язык перевода для участника
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
      setCreateError(err.message || "Не удалось создать конференцию. Попробуйте ещё раз.");
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

    // важно: сохраняем роль и настройки, чтобы после refresh / прямой ссылки организатор не терял роль
    saveConferenceToStorage(confForRoom);

    // роль продублируем в query param — это переживает refresh и не зависит от location.state
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
      setJoinError(err.message || "Не удалось подключиться. Проверьте код и попробуйте снова.");
    }
  };

  return (
    <div className="page-inner conferences-page">
      <h1 className="page-title">Конференции</h1>

      <section className="section-card">
        <h2 className="section-card-title">Создать конференцию</h2>
        <p className="section-card-subtitle">
          Введите название конференции. После создания вы получите уникальный код.
        </p>

        <form onSubmit={handleCreate} className="section-form">
          <div className="section-field">
            <label className="section-label">Название конференции</label>
            <input
              type="text"
              className="section-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Лекция по математике"
            />
          </div>

          {createError && <p className="section-message section-message_error">{createError}</p>}

          <button type="submit" className="section-button">
            Создать конференцию
          </button>
        </form>

        {createdConference && (
          <div className="section-created">
            <p className="section-created-text">
              Конференция создана. Код:{" "}
              <span className="section-created-code">{createdConference.code}</span>
            </p>
            <button
              type="button"
              className="section-button section-button_secondary"
              onClick={handleConnectCreated}
            >
              Подключиться как организатор
            </button>
          </div>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-card-title">Подключиться к конференции</h2>
        <p className="section-card-subtitle">Введите код конференции.</p>

        <form onSubmit={handleJoin} className="section-form">
          <div className="section-field">
            <label className="section-label">Код конференции</label>
            <input
              type="text"
              className="section-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Например: AB12CD34"
            />
          </div>

          <div className="section-field">
            <label className="section-label">Язык перевода</label>
            <select
              className="section-input"
              value={joinLang}
              onChange={(e) => setJoinLang(e.target.value)}
            >
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {joinError && <p className="section-message section-message_error">{joinError}</p>}

          <button type="submit" className="section-button">
            Подключиться
          </button>
        </form>
      </section>
    </div>
  );
}
