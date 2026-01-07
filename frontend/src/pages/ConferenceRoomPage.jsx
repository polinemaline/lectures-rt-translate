// frontend/src/pages/ConferenceRoomPage.jsx

import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function ConferenceRoomPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const conference = location.state?.conference;

  const title = conference?.title ?? "Конференция";
  const isOrganizer = conference?.is_organizer ?? false;

  const [participants, setParticipants] = useState([]);
  const listRef = useRef(null);

  // пока что заполняем только текущего пользователя
  useEffect(() => {
    if (!user) return;

    const displayName =
      profile?.displayName || user.full_name || user.email || "Участник";
    const avatarUrl = profile?.avatarDataUrl || null;

    setParticipants([
      {
        id: user.id ?? "me",
        name: displayName,
        avatarUrl,
      },
      // TODO: сюда позже будут добавляться остальные участники через WebSocket / API
    ]);
  }, [user, profile]);

  const handleExit = () => {
    navigate("/conferences");
  };

  const scrollByCards = (direction) => {
    const container = listRef.current;
    if (!container) return;

    const cardWidth = 220; // примерно ширина одного «кубика»
    container.scrollBy({
      left: direction === "left" ? -cardWidth : cardWidth,
      behavior: "smooth",
    });
  };

  return (
    <div className="conf-room">
      <div className="conf-room-header">
        <div>
          <h1 className="conf-room-title">{title}</h1>
          <p className="conf-room-subtitle">
            Код конференции:{" "}
            <span className="conf-room-code">{code}</span>
          </p>
          <p className="conf-room-role">
            Вы: {isOrganizer ? "организатор" : "участник"}
          </p>
        </div>

        <button className="conf-room-exit-button" onClick={handleExit}>
          Выйти из конференции
        </button>
      </div>

      {isOrganizer ? (
        <div className="conf-room-card">
          <div className="conf-participants-header">
            <div>
              <h2 className="conf-participants-title">Участники конференции</h2>
              <p className="conf-participants-subtitle">
                Здесь отображаются все пользователи, подключённые к этой комнате.
              </p>
            </div>
            <span className="conf-participants-count">
              {participants.length}
            </span>
          </div>

          <div className="conf-participants-list-wrapper">
            <button
              type="button"
              className="conf-participants-arrow"
              onClick={() => scrollByCards("left")}
            >
              ◀
            </button>

            <div className="conf-participants-list" ref={listRef}>
              {participants.map((p) => (
                <div key={p.id} className="conf-participant-card">
                  <div className="conf-participant-avatar">
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt={p.name} />
                    ) : (
                      <span>{p.name?.[0]?.toUpperCase() ?? "?"}</span>
                    )}
                  </div>
                  <div className="conf-participant-name">{p.name}</div>
                </div>
              ))}

              {participants.length === 0 && (
                <div className="conf-participants-empty">
                  Пока никто не подключился. Как только участники зайдут по
                  коду конференции, они появятся здесь.
                </div>
              )}
            </div>

            <button
              type="button"
              className="conf-participants-arrow"
              onClick={() => scrollByCards("right")}
            >
              ▶
            </button>
          </div>
        </div>
      ) : (
        <div className="conf-room-card">
          <p className="conf-room-info">
            Здесь позже появится интерфейс конференции и перевод речи в текст на
            выбранном вами языке.
          </p>
        </div>
      )}
    </div>
  );
}
