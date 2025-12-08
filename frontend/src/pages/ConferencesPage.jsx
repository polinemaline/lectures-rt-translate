// frontend/src/pages/ConferencesPage.jsx
import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export function ConferencesPage() {
  const { user } = useAuth();

  const [createName, setCreateName] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");

  const resetCreateMessages = () => {
    setCreateError("");
    setCreateSuccess("");
  };

  const resetJoinMessages = () => {
    setJoinError("");
    setJoinSuccess("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    resetCreateMessages();

    if (!createName.trim()) {
      setCreateError("Введите название конференции");
      return;
    }

    // здесь позже подключим реальный backend
    const fakeCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCreatedCode(fakeCode);
    setCreateSuccess("Конференция создана. Поделитесь кодом с участниками.");
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    resetJoinMessages();

    if (!joinCode.trim()) {
      setJoinError("Введите код конференции");
      return;
    }

    // здесь позже будет реальная проверка кода
    setJoinSuccess("Проверка кода прошла успешно. Можно подключаться.");
  };

  const handleCopyCode = async () => {
    if (!createdCode) return;
    try {
      await navigator.clipboard.writeText(createdCode);
      setCreateSuccess("Код скопирован в буфер обмена");
    } catch {
      setCreateError("Не удалось скопировать код");
    }
  };

  return (
    <div className="conferences-page">
      <div className="conferences-header">
        <h1 className="conferences-title">Конференции</h1>
        {user?.displayName && (
          <span className="conferences-user">
            Вы вошли как <b>{user.displayName}</b>
          </span>
        )}
      </div>

      <div className="conferences-grid">
        {/* Создать конференцию */}
        <section className="conference-card">
          <h2 className="conference-card-title">Создать конференцию</h2>
          <p className="conference-card-subtitle">
            Введите название конференции. После создания вы получите
            уникальный код, которым сможете поделиться с участниками.
          </p>

          <form onSubmit={handleCreate} className="conference-form">
            <div className="conference-field">
              <label className="conference-label">Название конференции</label>
              <input
                type="text"
                className="conference-input"
                placeholder="Например: Лекция по математике"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>

            {createdCode && (
              <div className="conference-code-block">
                <span className="conference-label">Код конференции</span>
                <div className="conference-code-row">
                  <div className="conference-code-box">{createdCode}</div>
                  <button
                    type="button"
                    className="conference-secondary-btn"
                    onClick={handleCopyCode}
                  >
                    Скопировать
                  </button>
                </div>
                <p className="conference-hint">
                  Отправьте этот код участникам, чтобы они могли подключиться.
                </p>
              </div>
            )}

            {createError && (
              <p className="conference-message conference-message_error">
                {createError}
              </p>
            )}
            {createSuccess && (
              <p className="conference-message conference-message_success">
                {createSuccess}
              </p>
            )}

            <button type="submit" className="conference-primary-btn">
              Создать конференцию
            </button>
          </form>
        </section>

        {/* Подключиться к конференции */}
        <section className="conference-card">
          <h2 className="conference-card-title">Подключиться к конференции</h2>
          <p className="conference-card-subtitle">
            Введите код конференции, который вам сообщил организатор.
          </p>

          <form onSubmit={handleJoin} className="conference-form">
            <div className="conference-field">
              <label className="conference-label">Код конференции</label>
              <input
                type="text"
                className="conference-input"
                placeholder="Например: AB12CD34"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
            </div>

            {joinError && (
              <p className="conference-message conference-message_error">
                {joinError}
              </p>
            )}
            {joinSuccess && (
              <p className="conference-message conference-message_success">
                {joinSuccess}
              </p>
            )}

            <button type="submit" className="conference-primary-btn">
              Подключиться
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
