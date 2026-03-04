// frontend/src/pages/ConferenceRoomPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { conferenceWsUrl, downloadExport, translateSegment } from "../api/conferences";
import { createNote } from "../services/notesService";

const LANG_NAME = {
  rus_Cyrl: "Русский",
  eng_Latn: "English",
  deu_Latn: "Deutsch",
  fra_Latn: "Français",
  spa_Latn: "Español",
  ita_Latn: "Italiano",
  por_Latn: "Português",
  tur_Latn: "Türkçe",
};

function langHuman(code) {
  if (!code) return "—";
  return LANG_NAME[code] || code;
}

function loadConferenceFromStorage(code) {
  try {
    const raw = localStorage.getItem(`conference:${code}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveConferenceToStorage(conf) {
  try {
    if (!conf?.code) return;
    localStorage.setItem(`conference:${conf.code}`, JSON.stringify(conf));
  } catch {
    // ignore
  }
}

export function ConferenceRoomPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, token } = useAuth();

  const roleParam = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("role");
    } catch {
      return null;
    }
  }, [location.search]);

  const storedConference = useMemo(() => {
    if (!code) return null;
    return loadConferenceFromStorage(code);
  }, [code]);

  const conference = useMemo(() => {
    const stateConf = location.state?.conference || null;
    const base = stateConf || storedConference;
    const fallback = base || {
      code,
      title: "Конференция",
      is_organizer: roleParam === "organizer",
      target_language: "eng_Latn",
      src_language: "rus_Cyrl",
    };

    if (roleParam === "organizer") return { ...fallback, is_organizer: true };
    if (roleParam === "participant") return { ...fallback, is_organizer: false };
    return fallback;
  }, [code, location.state, storedConference, roleParam]);

  useEffect(() => {
    if (!conference?.code) return;
    saveConferenceToStorage(conference);
  }, [conference]);

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

  const recognitionRef = useRef(null);
  const audioStreamRef = useRef(null);
  const [micOn, setMicOn] = useState(false);
  const micOnRef = useRef(false);

  const restartTimerRef = useRef(null);
  const restartingRef = useRef(false);
  const networkFailCountRef = useRef(0);

  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");
  const [busy, setBusy] = useState(false);

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
    const displayName = profile?.displayName || user.full_name || user.email || "Участник";
    const avatarUrl = profile?.avatarDataUrl || null;
    setParticipants([{ id: user.id ?? "me", name: displayName, avatarUrl }]);
  }, [user, profile]);

  useEffect(() => {
    if (!code) return;

    const ws = new WebSocket(conferenceWsUrl(code));
    wsRef.current = ws;

    ws.onopen = () => {
      const joinMsg = { type: "join", role: isOrganizer ? "organizer" : "participant" };
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
          if (Array.isArray(msg.translated_items) && msg.translated_items.length === items.length) {
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

      if (msg.type === "ended") setConfStatus("ended");
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

  const scheduleRestart = () => {
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
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Web Speech API не поддерживается в этом браузере.");
      return null;
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = sttLang;
    return rec;
  };

  const startRecognitionOnly = async () => {
    if (!micOnRef.current) return;
    if (!isOrganizer) return;

    const rec = createRecognition();
    if (!rec) return;
    recognitionRef.current = rec;

    rec.onresult = (event) => {
      try {
        const last = event.results?.[event.results.length - 1];
        const text = (last?.[0]?.transcript || "").trim();
        if (!text) return;
        wsRef.current?.send(JSON.stringify({ type: "segment", text }));
      } catch {}
    };

    rec.onerror = () => scheduleRestart();
    rec.onend = () => scheduleRestart();

    try {
      rec.start();
      networkFailCountRef.current = 0;
    } catch {
      scheduleRestart();
    }
  };

  const startMic = async () => {
    if (!isOrganizer) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
    } catch {
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
    container.scrollBy({ left: direction === "left" ? -cardWidth : cardWidth, behavior: "smooth" });
  };

  const doExport = (format) => {
    const original_text = originalLines.join("\n");
    const translated_text = translatedLines.join("\n");
    downloadExport(code, format, srcLang, tgtLang, original_text, translated_text);
  };

  const handleSaveToSite = async () => {
    setUiError("");
    setUiSuccess("");

    try {
      setBusy(true);

      const payload = {
        title: `Конференция ${code} — ${title}`,
        original_language: srcLang,
        target_language: tgtLang,
        original_text: originalLines.join("\n"),
        translated_text: translatedLines.join("\n"),
      };

      await createNote(payload, token);
      setUiSuccess("Сохранено в конспекты");
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось сохранить на сайте");
    } finally {
      setBusy(false);
    }
  };

  const goBackToList = () => navigate("/conferences");

  return (
    <div className="page-inner room-page">
      <h1 className="page-title">{title}</h1>

      <div style={{ marginTop: -10, color: "#9ca3af" }}>
        Код конференции: <b>{code}</b>
      </div>

      <div style={{ marginTop: 6, color: "#9ca3af" }}>
        Вы: <b>{isOrganizer ? "организатор" : "участник"}</b>
        {!isOrganizer && (
          <>
            {" "}
            | перевод: <b>{langHuman(srcLang)} → {langHuman(tgtLang)}</b>
          </>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <button className="conference-secondary-btn" onClick={handleExit}>
          {isOrganizer ? "Выйти" : "Выйти из конференции"}
        </button>
      </div>

      {isOrganizer && confStatus === "active" && (
        <div className="conference-card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Управление конференцией</h2>
          <p style={{ marginTop: -8, color: "#9ca3af" }}>
            Включите микрофон — ваша речь будет распознаваться и отправляться участникам как субтитры.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="conference-primary-btn" onClick={toggleMic}>
              {micOn ? "Микрофон: ВЫКЛ" : "Микрофон: ВКЛ"}
            </button>

            <button
              className="conference-secondary-btn"
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

      {isOrganizer ? (
        <div className="conference-card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Участники конференции</h2>
          <p style={{ marginTop: -8, color: "#9ca3af" }}>
            Пока показывается только вы. Позже добавим список через WS.
          </p>

          <div style={{ color: "#9ca3af", fontSize: 13 }}>Сейчас в конференции: {participants.length}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <button className="conference-secondary-btn" onClick={() => scrollByCards("left")}>
              ◀
            </button>
            <div
              ref={listRef}
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                paddingBottom: 6,
                scrollBehavior: "smooth",
              }}
            >
              {participants.map((p) => (
                <div
                  key={p.id}
                  style={{
                    minWidth: 210,
                    border: "1px solid rgba(148,163,184,0.25)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(2,6,23,0.5)",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "#111827",
                      border: "1px solid #4b5563",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="avatar" style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <span>{p.name?.[0]?.toUpperCase() ?? "?"}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 14 }}>{p.name}</div>
                </div>
              ))}
            </div>
            <button className="conference-secondary-btn" onClick={() => scrollByCards("right")}>
              ▶
            </button>
          </div>
        </div>
      ) : null}

      {!isOrganizer && (
        <div className="notes-shell" style={{ marginTop: 18 }}>
          <div className="notes-panel">
            <div className="notes-panel-title">Оригинал</div>
            <div className="notes-panel-subtitle">STT организатора</div>
            <div className="notes-panel-body">
              {originalLines.map((l, i) => (
                <div key={i} className="notes-line">
                  {l}
                </div>
              ))}
            </div>
          </div>

          <div className="notes-panel">
            <div className="notes-panel-title">Перевод</div>
            <div className="notes-panel-subtitle">на ваш язык</div>
            <div className="notes-panel-body">
              {translatedLines.map((l, i) => (
                <div key={i} className="notes-line">
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isOrganizer && confStatus === "ended" && (
        <div className="conference-card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Конференция завершена</h2>
          <p style={{ marginTop: -8, color: "#9ca3af" }}>
            Вы можете сохранить конспект или вернуться к списку конференций.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="conference-secondary-btn" onClick={() => doExport("pdf")}>
              Сохранить PDF
            </button>
            <button className="conference-secondary-btn" onClick={() => doExport("docx")}>
              Сохранить DOCX
            </button>

            <button className="conference-primary-btn" onClick={handleSaveToSite} disabled={busy}>
              Сохранить на сайте
            </button>

            <button className="conference-secondary-btn" onClick={goBackToList}>
              Вернуться к конференциям
            </button>
          </div>

          {uiError && (
            <div className="conference-message conference-message_error" style={{ marginTop: 12 }}>
              {uiError}
            </div>
          )}
          {uiSuccess && (
            <div className="conference-message conference-message_success" style={{ marginTop: 12 }}>
              {uiSuccess}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
