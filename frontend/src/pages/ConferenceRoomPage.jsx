// frontend/src/pages/ConferenceRoomPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { conferenceWsUrl, downloadExport, translateSegment } from "../api/conferences";

export function ConferenceRoomPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const conference = location.state?.conference;

  const title = conference?.title ?? "Конференция";
  const isOrganizer = conference?.is_organizer ?? false;

  const srcLang = conference?.src_language ?? "rus_Cyrl";
  const tgtLang = conference?.target_language ?? "eng_Latn";

  const [participants, setParticipants] = useState([]);
  const listRef = useRef(null);

  const [originalLines, setOriginalLines] = useState([]);
  const [translatedLines, setTranslatedLines] = useState([]);
  const [confStatus, setConfStatus] = useState("active"); // active|ended

  const wsRef = useRef(null);

  // --- organizer STT ---
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);

  const sttLang = useMemo(() => {
    // только пример — можешь расширить
    if (srcLang === "rus_Cyrl") return "ru-RU";
    return "en-US";
  }, [srcLang]);

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
    ]);
  }, [user, profile]);

  // WS connect + receive segments
  useEffect(() => {
    if (!code) return;

    const ws = new WebSocket(conferenceWsUrl(code));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", role: isOrganizer ? "organizer" : "participant" }));
    };

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "history") {
        const items = msg.items || [];
        setOriginalLines(items);

        const out = [];
        for (const line of items) {
          try {
            const tr = await translateSegment(line, srcLang, tgtLang);
            out.push(tr.translated || "");
          } catch {
            out.push("");
          }
        }
        setTranslatedLines(out);

        if (msg.is_active === false) setConfStatus("ended");
        return;
      }

      if (msg.type === "segment") {
        const text = (msg.text || "").trim();
        if (!text) return;

        setOriginalLines((prev) => [...prev, text]);

        try {
          const tr = await translateSegment(text, srcLang, tgtLang);
          setTranslatedLines((prev) => [...prev, tr.translated || ""]);
        } catch (e) {
          console.error(e);
          setTranslatedLines((prev) => [...prev, ""]);
        }
      }

      if (msg.type === "ended") {
        setConfStatus("ended");
      }
    };

    ws.onclose = () => {};

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [code, isOrganizer, srcLang, tgtLang]);

  const startSTT = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Web Speech API не поддерживается. Используй Chrome/Edge.");
      return;
    }

    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.lang = sttLang;
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const text = (res[0].transcript || "").trim();
          if (text && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "segment", text }));
          }
        }
      }
    };

    rec.onerror = (e) => {
      console.error(e);
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
    };

    rec.start();
    setListening(true);
  };

  const stopSTT = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
  };

  const handleExit = () => {
    // при выходе участника показываем export (как минимум после выхода можно сразу)
    // но UX: лучше сначала показать блок экспорта, а кнопку "выйти" делать ниже.
    setConfStatus("ended");
  };

  const scrollByCards = (direction) => {
    const container = listRef.current;
    if (!container) return;

    const cardWidth = 220;
    container.scrollBy({
      left: direction === "left" ? -cardWidth : cardWidth,
      behavior: "smooth",
    });
  };

  const doExport = (format) => {
  const translated_text = translatedLines.join("\n");
  downloadExport(code, format, srcLang, tgtLang, translated_text);
  };

  const goBackToList = () => {
    navigate("/conferences");
  };

  return (
    <div className="conf-room">
      <div className="conf-room-header">
        <div>
          <h1 className="conf-room-title">{title}</h1>
          <p className="conf-room-subtitle">
            Код конференции: <span className="conf-room-code">{code}</span>
          </p>
          <p className="conf-room-role">
            Вы: {isOrganizer ? "организатор" : "участник"} | перевод: {tgtLang}
          </p>
        </div>

        <button className="conf-room-exit-button" onClick={handleExit}>
          Выйти из конференции
        </button>
      </div>

      {isOrganizer && confStatus === "active" && (
        <div className="conf-room-card" style={{ marginBottom: 12 }}>
          <h2 className="conf-participants-title">Управление субтитрами</h2>
          <p className="conf-participants-subtitle">
            Нажмите “Начать STT” — речь с микрофона будет распознаваться и рассылаться всем участникам.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!listening ? (
              <button className="section-button" onClick={startSTT}>
                Начать STT
              </button>
            ) : (
              <button className="section-button" onClick={stopSTT}>
                Остановить STT
              </button>
            )}
            <button
              className="section-button section-button_secondary"
              onClick={() => wsRef.current?.send(JSON.stringify({ type: "end" }))}
            >
              Завершить конференцию
            </button>
          </div>
        </div>
      )}

      {isOrganizer ? (
        <div className="conf-room-card">
          <div className="conf-participants-header">
            <div>
              <h2 className="conf-participants-title">Участники конференции</h2>
              <p className="conf-participants-subtitle">
                Сейчас показывается только вы. Позже добавим список через WS.
              </p>
            </div>
            <span className="conf-participants-count">{participants.length}</span>
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
      ) : null}

      {/* subtitles blocks for everyone */}
      <div className="conf-room-card" style={{ marginTop: 12 }}>
        <h2 className="conf-participants-title">Субтитры</h2>
        <p className="conf-participants-subtitle">
          Слева оригинал (STT организатора), справа перевод на ваш язык.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Оригинал</h3>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {originalLines.map((l, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  {l}
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Перевод</h3>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {translatedLines.map((l, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {confStatus === "ended" && (
        <div className="conf-room-card" style={{ marginTop: 12 }}>
          <h2 className="conf-participants-title">Конференция завершена</h2>
          <p className="conf-participants-subtitle">
            Вы можете сохранить конспект или вернуться к списку конференций.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="section-button" onClick={() => doExport("pdf")}>
              Сохранить PDF
            </button>
            <button className="section-button" onClick={() => doExport("docx")}>
              Сохранить DOCX
            </button>
            <button
              className="section-button section-button_secondary"
              onClick={() => alert("Сохранение на сайте (заглушка)")}
            >
              Сохранить на сайте (заглушка)
            </button>
            <button className="conf-room-exit-button" onClick={goBackToList}>
              Вернуться к конференциям
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
