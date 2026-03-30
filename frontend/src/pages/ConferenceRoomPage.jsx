import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  conferenceWsUrl,
  downloadExport,
  translateSegment,
} from "../api/conferences";
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

function langHuman(code) {
  if (!code) return "—";
  return LANG_NAME[code] || code;
}

function storageKeyForConference(code) {
  return `conference:${code}`;
}

function loadConferenceFromSession(code) {
  try {
    const raw = window.sessionStorage.getItem(storageKeyForConference(code));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveConferenceToSession(conf) {
  try {
    if (!conf?.code) return;
    window.sessionStorage.setItem(
      storageKeyForConference(conf.code),
      JSON.stringify(conf)
    );
  } catch {
    // ignore
  }
}

function appendUniqueLine(setter, value) {
  const text = (value || "").trim();
  if (!text) return;

  setter((prev) => {
    if (prev.length > 0 && prev[prev.length - 1] === text) return prev;
    return [...prev, text];
  });
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
    return loadConferenceFromSession(code);
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
    saveConferenceToSession(conference);
  }, [conference]);

  const title = conference?.title ?? "Конференция";
  const isOrganizer = conference?.is_organizer ?? false;
  const srcLang = conference?.src_language ?? "rus_Cyrl";
  const tgtLang = conference?.target_language ?? "eng_Latn";

  const [participants, setParticipants] = useState([]);
  const listRef = useRef(null);

  const [originalLines, setOriginalLines] = useState([]);
  const [translatedLines, setTranslatedLines] = useState([]);
  const [originalPartial, setOriginalPartial] = useState("");
  const [translatedPartial, setTranslatedPartial] = useState("");
  const [confStatus, setConfStatus] = useState("active");

  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const lastPartialSentRef = useRef("");
  const micOnRef = useRef(false);

  const [micOn, setMicOn] = useState(false);
  const [socketReady, setSocketReady] = useState(false);

  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  useEffect(() => {
    if (!user) return;
    const displayName =
      profile?.displayName || user.full_name || user.email || "Участник";
    const avatarUrl = profile?.avatarDataUrl || null;
    setParticipants([{ id: user.id ?? "me", name: displayName, avatarUrl }]);
  }, [user, profile]);

  const sttLang = useMemo(() => {
    if (srcLang === "rus_Cyrl") return "ru-RU";
    if (srcLang === "eng_Latn") return "en-US";
    if (srcLang === "deu_Latn") return "de-DE";
    if (srcLang === "fra_Latn") return "fr-FR";
    if (srcLang === "spa_Latn") return "es-ES";
    if (srcLang === "ita_Latn") return "it-IT";
    if (srcLang === "por_Latn") return "pt-PT";
    if (srcLang === "tur_Latn") return "tr-TR";
    return "en-US";
  }, [srcLang]);

  const sendJson = (payload) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopRecognition = () => {
    clearRestartTimer();

    try {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onstart = null;
      }
    } catch {
      // ignore
    }

    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    }

    try {
      recognitionRef.current?.abort?.();
    } catch {
      // ignore
    }

    recognitionRef.current = null;
  };

  const scheduleRecognitionRestart = () => {
    if (!isOrganizer) return;
    if (!micOnRef.current) return;
    if (!socketReady) return;

    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      startRecognition();
    }, 700);
  };

  const startRecognition = () => {
    if (!isOrganizer) return;
    if (!micOnRef.current) return;
    if (!socketReady) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setUiError(
        "Ваш браузер не поддерживает SpeechRecognition. Используйте Chrome или Edge."
      );
      return;
    }

    stopRecognition();

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = sttLang;

    rec.onresult = (event) => {
      let interimText = "";
      const finalTexts = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = (result?.[0]?.transcript || "").trim();
        if (!text) continue;

        if (result.isFinal) {
          finalTexts.push(text);
        } else {
          interimText = text;
        }
      }

      setOriginalPartial(interimText);

      if (interimText !== lastPartialSentRef.current) {
        lastPartialSentRef.current = interimText;
        sendJson({ type: "segment_partial", text: interimText });
      }

      for (const text of finalTexts) {
        appendUniqueLine(setOriginalLines, text);
        setOriginalPartial("");
        lastPartialSentRef.current = "";
        sendJson({ type: "segment_partial", text: "" });
        sendJson({ type: "segment_final", text });
      }
    };

    rec.onerror = () => {
      scheduleRecognitionRestart();
    };

    rec.onend = () => {
      scheduleRecognitionRestart();
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setUiError("");
    } catch {
      scheduleRecognitionRestart();
    }
  };

  const startMic = async () => {
    if (!isOrganizer) return;

    if (!socketReady) {
      setUiError("WebSocket ещё не готов. Подождите секунду и попробуйте снова.");
      return;
    }

    micOnRef.current = true;
    setMicOn(true);
    setUiError("");
    startRecognition();
  };

  const stopMic = () => {
    micOnRef.current = false;
    setMicOn(false);
    stopRecognition();
    setOriginalPartial("");
    lastPartialSentRef.current = "";
    sendJson({ type: "segment_partial", text: "" });
  };

  useEffect(() => {
    if (!code) return;

    const ws = new WebSocket(conferenceWsUrl(code));
    wsRef.current = ws;

    ws.onopen = () => {
      setSocketReady(true);
      setUiError("");

      const joinMsg = {
        type: "join",
        role: isOrganizer ? "organizer" : "participant",
      };

      if (isOrganizer) joinMsg.src_lang = srcLang;
      else joinMsg.tgt_lang = tgtLang;

      ws.send(JSON.stringify(joinMsg));
    };

    ws.onerror = () => {
      setUiError(
        "WebSocket соединение прервалось. Проверь код конференции и обнови страницу."
      );
    };

    ws.onclose = () => {
      setSocketReady(false);
    };

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === "history") {
        const items = msg.items || [];
        setOriginalLines(items);
        setOriginalPartial("");

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
          setTranslatedPartial("");
        }

        if (msg.is_active === false) setConfStatus("ended");
        return;
      }

      if (msg.type === "caption_partial") {
        const text = (msg.text || "").trim();
        setOriginalPartial(text);

        if (!isOrganizer) {
          setTranslatedPartial((msg.translated || "").trim());
        }
        return;
      }

      if (msg.type === "caption_final" || msg.type === "segment") {
        const text = (msg.text || "").trim();
        if (!text) return;

        appendUniqueLine(setOriginalLines, text);
        setOriginalPartial((prev) => (prev === text ? "" : prev));

        if (!isOrganizer) {
          if (typeof msg.translated === "string") {
            appendUniqueLine(setTranslatedLines, msg.translated || "");
            setTranslatedPartial((prev) =>
              prev === (msg.translated || "") ? "" : prev
            );
          } else {
            try {
              const tr = await translateSegment(text, srcLang, tgtLang);
              appendUniqueLine(setTranslatedLines, tr.translated || "");
              setTranslatedPartial("");
            } catch {
              appendUniqueLine(setTranslatedLines, "");
            }
          }
        }
        return;
      }

      if (msg.type === "ended") {
        setConfStatus("ended");
        setOriginalPartial("");
        setTranslatedPartial("");
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [code, isOrganizer, srcLang, tgtLang]);

  useEffect(() => {
    return () => {
      stopMic();
    };
  }, []);

  const toggleMic = () => {
    if (!isOrganizer) return;
    if (micOn) stopMic();
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

  const doExport = (format) => {
    const original_text = [...originalLines, originalPartial].filter(Boolean).join("\n");
    const translated_text = [...translatedLines, translatedPartial]
      .filter(Boolean)
      .join("\n");
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
        original_text: [...originalLines, originalPartial].filter(Boolean).join("\n"),
        translated_text: [...translatedLines, translatedPartial]
          .filter(Boolean)
          .join("\n"),
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
        <button
          className="conference-secondary-btn"
          style={secondaryButtonStyle}
          onClick={handleExit}
        >
          {isOrganizer ? "Выйти" : "Выйти из конференции"}
        </button>
      </div>

      {isOrganizer && confStatus === "active" && (
        <div className="conference-card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Управление конференцией</h2>
          <p style={{ marginTop: -8, color: "#9ca3af" }}>
            Включите микрофон. Субтитры будут идти в реальном времени с промежуточными обновлениями.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={toggleMic}
            >
              {micOn ? "Микрофон: ВЫКЛ" : "Микрофон: ВКЛ"}
            </button>

            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={() => {
                stopMic();
                sendJson({ type: "end" });
              }}
            >
              Завершить конференцию
            </button>
          </div>

          <div style={{ marginTop: 10, color: "#9ca3af", fontSize: 13 }}>
            Соединение: {socketReady ? "готово" : "подключение..."}
          </div>
        </div>
      )}

      {isOrganizer ? (
        <div className="conference-card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Участники конференции</h2>
          <p style={{ marginTop: -8, color: "#9ca3af" }}>
            Пока показывается только вы. Позже можно добавить presence через WebSocket.
          </p>

          <div style={{ color: "#9ca3af", fontSize: 13 }}>
            Сейчас в конференции: {participants.length}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={() => scrollByCards("left")}
            >
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
                      <img
                        src={p.avatarUrl}
                        alt="avatar"
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <span>{p.name?.[0]?.toUpperCase() ?? "?"}</span>
                    )}
                  </div>

                  <div style={{ fontSize: 14 }}>{p.name}</div>
                </div>
              ))}
            </div>

            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={() => scrollByCards("right")}
            >
              ▶
            </button>
          </div>
        </div>
      ) : null}

      <div className="notes-shell" style={{ marginTop: 18 }}>
        <div className="notes-panel">
          <div className="notes-panel-title">Оригинал</div>
          <div className="notes-panel-subtitle">
            {isOrganizer ? "Предпросмотр live-субтитров" : "STT организатора"}
          </div>
          <div className="notes-panel-body">
            {originalLines.map((line, index) => (
              <div key={index} className="notes-line">
                {line}
              </div>
            ))}
            {originalPartial && (
              <div className="notes-line" style={{ opacity: 0.7, fontStyle: "italic" }}>
                {originalPartial}
              </div>
            )}
          </div>
        </div>

        {!isOrganizer && (
          <div className="notes-panel">
            <div className="notes-panel-title">Перевод</div>
            <div className="notes-panel-subtitle">на ваш язык</div>
            <div className="notes-panel-body">
              {translatedLines.map((line, index) => (
                <div key={index} className="notes-line">
                  {line}
                </div>
              ))}
              {translatedPartial && (
                <div className="notes-line" style={{ opacity: 0.7, fontStyle: "italic" }}>
                  {translatedPartial}
                </div>
              )}
            </div>
          </div>
        )}
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

      {!isOrganizer && confStatus === "ended" && (
        <div className="conference-card" style={{ marginTop: 18 }}>
          <h2 style={{ marginTop: 0 }}>Конференция завершена</h2>
          <p style={{ marginTop: -8, color: "#9ca3af" }}>
            Вы можете сохранить конспект или вернуться к списку конференций.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={() => doExport("pdf")}
            >
              Сохранить PDF
            </button>
            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={() => doExport("docx")}
            >
              Сохранить DOCX
            </button>
            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={handleSaveToSite}
              disabled={busy}
            >
              Сохранить на сайте
            </button>
            <button
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
              onClick={goBackToList}
            >
              Вернуться к конференциям
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
