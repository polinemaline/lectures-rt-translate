// frontend/src/pages/ConferenceRoomPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  conferenceWsUrl,
  downloadExport,
  translateSegment,
} from "../api/conferences";

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

  // --- organizer mic/STT ---
  const recognitionRef = useRef(null);
  const audioStreamRef = useRef(null);
  const [micOn, setMicOn] = useState(false);
  const micOnRef = useRef(false);

  // timers / guards for restart
  const restartTimerRef = useRef(null);
  const restartingRef = useRef(false);
  const networkFailCountRef = useRef(0);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  const sttLang = useMemo(() => {
    if (srcLang === "rus_Cyrl") return "ru-RU";
    if (srcLang === "eng_Latn") return "en-US";
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

  // WS connect + receive
  useEffect(() => {
    if (!code) return;

    const ws = new WebSocket(conferenceWsUrl(code));
    wsRef.current = ws;

    ws.onopen = () => {
      const joinMsg = {
        type: "join",
        role: isOrganizer ? "organizer" : "participant",
      };

      if (isOrganizer) joinMsg.src_lang = srcLang;
      else joinMsg.tgt_lang = tgtLang;

      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "history") {
        const items = msg.items || [];
        setOriginalLines(items);

        if (!isOrganizer) {
          if (
            Array.isArray(msg.translated_items) &&
            msg.translated_items.length === items.length
          ) {
            setTranslatedLines(msg.translated_items);
          } else {
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
          }
        }

        if (msg.is_active === false) setConfStatus("ended");
        return;
      }

      if (msg.type === "segment") {
        const text = (msg.text || "").trim();
        if (!text) return;

        setOriginalLines((prev) => [...prev, text]);

        if (!isOrganizer) {
          if (typeof msg.translated === "string") {
            setTranslatedLines((prev) => [...prev, msg.translated]);
          } else {
            try {
              const tr = await translateSegment(text, srcLang, tgtLang);
              setTranslatedLines((prev) => [...prev, tr.translated || ""]);
            } catch {
              setTranslatedLines((prev) => [...prev, ""]);
            }
          }
        }
      }

      if (msg.type === "ended") {
        setConfStatus("ended");
      }
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [code, isOrganizer, srcLang, tgtLang]);

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopRecognitionInstance = () => {
    try {
      recognitionRef.current?.onresult && (recognitionRef.current.onresult = null);
      recognitionRef.current?.onend && (recognitionRef.current.onend = null);
      recognitionRef.current?.onerror && (recognitionRef.current.onerror = null);
      recognitionRef.current?.onstart && (recognitionRef.current.onstart = null);
    } catch {}
    try {
      recognitionRef.current?.abort?.();
    } catch {}
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    recognitionRef.current = null;
  };

  const scheduleRestart = (reason = "") => {
    if (!micOnRef.current) return;
    if (restartingRef.current) return;

    restartingRef.current = true;
    clearRestartTimer();

    networkFailCountRef.current = Math.min(networkFailCountRef.current + 1, 6);
    const n = networkFailCountRef.current;
    const delay = Math.min(800 + n * 400, 3500);

    restartTimerRef.current = setTimeout(async () => {
      try {
        stopRecognitionInstance();
        await startRecognitionOnly();
      } finally {
        restartingRef.current = false;
      }
    }, delay);
  };

  const createRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Web Speech API не поддерживается. Используй Chrome/Edge/Я.Браузер.");
      return null;
    }

    const rec = new SpeechRecognition();
    rec.lang = sttLang;
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
      if (!micOnRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const text = (res[0].transcript || "").trim();
          if (!text) continue;

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "segment", text }));
          }
        }
      }
    };

    rec.onerror = (e) => {
      const err = typeof e?.error === "string" ? e.error : "unknown";

      if (micOnRef.current && (err === "network" || err === "service-not-allowed")) {
        scheduleRestart(err);
        return;
      }

      micOnRef.current = false;
      setMicOn(false);
    };

    rec.onend = () => {
      if (micOnRef.current) {
        scheduleRestart("ended");
      }
    };

    return rec;
  };

  const startRecognitionOnly = async () => {
    if (!micOnRef.current) return;

    const rec = createRecognition();
    if (!rec) return;

    recognitionRef.current = rec;

    try {
      rec.start();
      networkFailCountRef.current = 0;
    } catch (e) {
      scheduleRestart("start-failed");
    }
  };

  const startMic = async () => {
    if (!isOrganizer) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
    } catch (e) {
      micOnRef.current = false;
      setMicOn(false);
      alert("Нет доступа к микрофону (разрешение не выдано).");
      return;
    }

    micOnRef.current = true;
    setMicOn(true);

    clearRestartTimer();
    stopRecognitionInstance();
    networkFailCountRef.current = 0;

    await startRecognitionOnly();
  };

  const stopMic = () => {
    micOnRef.current = false;
    setMicOn(false);

    clearRestartTimer();
    stopRecognitionInstance();

    try {
      audioStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {}
    audioStreamRef.current = null;
  };

  const toggleMic = () => {
    if (!isOrganizer) return;
    if (micOnRef.current) stopMic();
    else startMic();
  };

  const handleExit = () => {
    if (isOrganizer) {
      stopMic();
      navigate("/conferences");
      return;
    }
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

  // ✅ ВАЖНО: экспортируем то, что реально видит участник (а не пытаемся заново переводить)
  const doExport = (format) => {
    const original_text = originalLines.join("\n");
    const translated_text = translatedLines.join("\n");
    downloadExport(code, format, srcLang, tgtLang, original_text, translated_text);
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
            Вы: {isOrganizer ? "организатор" : "участник"}
            {!isOrganizer && <> | перевод: {tgtLang}</>}
          </p>
        </div>

        <button className="conf-room-exit-button" onClick={handleExit}>
          {isOrganizer ? "Выйти" : "Выйти из конференции"}
        </button>
      </div>

      {/* Organizer controls only */}
      {isOrganizer && confStatus === "active" && (
        <div className="conf-room-card" style={{ marginBottom: 12 }}>
          <h2 className="conf-participants-title">Управление конференцией</h2>
          <p className="conf-participants-subtitle">
            Включите микрофон — ваша речь будет распознаваться и отправляться участникам как субтитры.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="section-button" onClick={toggleMic}>
              {micOn ? "Микрофон: ВЫКЛ" : "Микрофон: ВКЛ"}
            </button>

            <button
              className="section-button section-button_secondary"
              onClick={() => {
                stopMic();
                wsRef.current?.send(JSON.stringify({ type: "end" }));
              }}
            >
              Завершить конференцию
            </button>
          </div>
        </div>
      )}

      {/* Organizer participants view */}
      {isOrganizer ? (
        <div className="conf-room-card">
          <div className="conf-participants-header">
            <div>
              <h2 className="conf-participants-title">Участники конференции</h2>
              <p className="conf-participants-subtitle">
                Пока показывается только вы. Позже добавим список через WS.
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

      {/* Subtitles ONLY for participants */}
      {!isOrganizer && (
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
      )}

      {/* Export ONLY for participants */}
      {!isOrganizer && confStatus === "ended" && (
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
