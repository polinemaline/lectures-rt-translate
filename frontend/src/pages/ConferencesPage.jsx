// frontend/src/pages/ConferencesPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createConference, joinConference } from "../api/conferences";

export function ConferencesPage() {
  const navigate = useNavigate();

  // создание конференции
  const [title, setTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [createdConference, setCreatedConference] = useState(null);

  // подключение по коду
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");

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
      // ждём от бэка объект вида { id, code, title }
      const conf = await createConference(trimmedTitle);

      setCreatedConference(conf);
      setTitle("");
    } catch (err) {
      console.error("create conference error:", err);
      setCreateError(
        err.message || "Не удалось создать конференцию. Попробуйте ещё раз."
      );
    }
  };

  const handleConnectCreated = () => {
    if (!createdConference?.code) return;

    navigate(`/conference/${createdConference.code}`, {
      state: {
        conference: {
          ...createdConference,
          title: createdConference.title ?? "Конференция",
          is_organizer: true,
        },
      },
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
      // ждём от бэка объект вида { id, code, title }
      const conf = await joinConference(trimmed);

      navigate(`/conference/${conf.code}`, {
        state: {
          conference: {
            ...conf,
            title: conf.title ?? "Конференция",
            is_organizer: false,
          },
        },
      });
    } catch (err) {
      console.error("join conference error:", err);
      setJoinError(
        err.message ||
          "Не удалось подключиться к конференции. Проверьте код и попробуйте снова."
      );
    }
  };

  return (
    <div className="page-inner">
      <h1 className="page-title">Конференции</h1>

      {/* блок "создать конференцию" */}
      <section className="section-card">
        <h2 className="section-card-title">Создать конференцию</h2>
        <p className="section-card-subtitle">
          Введите название конференции. После создания вы получите уникальный
          код, которым сможете поделиться с участниками.
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

          {createError && (
            <p className="section-message section-message_error">
              {createError}
            </p>
          )}

          <button type="submit" className="section-button">
            Создать конференцию
          </button>
        </form>

        {createdConference && (
          <div className="section-created">
            <p className="section-created-text">
              Конференция создана. Код:{" "}
              <span className="section-created-code">
                {createdConference.code}
              </span>
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

      {/* блок "подключиться к конференции" */}
      <section className="section-card">
        <h2 className="section-card-title">Подключиться к конференции</h2>
        <p className="section-card-subtitle">
          Введите код конференции, который вам сообщил организатор.
        </p>

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

          {joinError && (
            <p className="section-message section-message_error">
              {joinError}
            </p>
          )}

          <button type="submit" className="section-button">
            Подключиться
          </button>
        </form>
      </section>
    </div>
  );
}
