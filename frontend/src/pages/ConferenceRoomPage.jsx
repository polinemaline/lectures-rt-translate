// src/pages/ConferenceRoomPage.jsx

import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export function ConferenceRoomPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const conference = location.state?.conference;

  const title = conference?.title ?? "Конференция";
  const isOrganizer = conference?.is_organizer ?? false;

  const handleExit = () => {
    navigate("/conferences");
  };

  return (
    <div className="min-h-full flex flex-col gap-4 text-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">{title}</h1>
          <p className="text-sm text-slate-300">
            Код конференции:{" "}
            <span className="font-mono font-semibold text-indigo-300">
              {code}
            </span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Вы: {isOrganizer ? "организатор" : "участник"}
          </p>
        </div>

        <button
          onClick={handleExit}
          className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-600
                     hover:bg-slate-700 text-sm font-medium transition-colors"
        >
          Выйти из конференции
        </button>
      </div>

      <div className="flex-1 mt-4 rounded-2xl bg-slate-900/60 border border-slate-700 p-4 shadow-lg">
        <p className="text-sm text-slate-300">
          Здесь позже появится интерфейс конференции и перевод речи в текст на
          выбранном языке.
        </p>
      </div>
    </div>
  );
}
