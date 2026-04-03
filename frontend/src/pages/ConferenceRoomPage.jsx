import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  conferenceWsUrl,
  defaultIceServers,
  downloadExport,
  translateSegment,
} from "../api/conferences";
import { useAuth } from "../auth/AuthContext";
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

const pageStyle = {
  display: "grid",
  gap: 16,
  padding: "8px 0 24px",
};

const cardStyle = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 24,
  padding: 20,
  boxShadow: "0 18px 44px rgba(15, 23, 42, 0.18)",
};

const panelTitleStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: "#f8fafc",
};

const mutedStyle = {
  margin: 0,
  color: "#94a3b8",
  lineHeight: 1.5,
};

const primaryButtonStyle = {
  minHeight: 42,
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg, #38bdf8, #818cf8)",
  color: "#0f172a",
  padding: "0 18px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  minHeight: 42,
  borderRadius: 999,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.62)",
  color: "#e5eefc",
  padding: "0 18px",
  fontWeight: 600,
  cursor: "pointer",
};

const dangerButtonStyle = {
  ...secondaryButtonStyle,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  color: "#fecaca",
};

const videoWrapStyle = {
  width: "100%",
  maxWidth: 860,
  margin: "0 auto",
};

const videoStyle = {
  width: "100%",
  aspectRatio: "16 / 9",
  maxHeight: 360,
  borderRadius: 18,
  background: "#020617",
  objectFit: "contain",
  display: "block",
};

const listCardStyle = {
  borderRadius: 18,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(2, 6, 23, 0.35)",
  padding: 14,
  maxHeight: 240,
  overflowY: "auto",
  scrollBehavior: "smooth",
};

const participantListStyle = {
  display: "grid",
  gap: 8,
};

const participantRowStyle = {
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "rgba(2, 6, 23, 0.35)",
  padding: "10px 12px",
  color: "#f8fafc",
};

const subtitlesCardContentStyle = {
  display: "grid",
  gap: 8,
};

function langHuman(code) {
  if (!code) return "—";
  return LANG_NAME[code] || code;
}

function storageKeyForConference(code) {
  return `conference:${code}`;
}

function loadConferenceFromStorage(code) {
  if (!code) return null;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(storageKeyForConference(code));
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore broken storage
    }
  }

  return null;
}

function saveConferenceToStorage(conf) {
  try {
    if (!conf?.code) return;
    const raw = JSON.stringify(conf);
    window.sessionStorage.setItem(storageKeyForConference(conf.code), raw);
    window.localStorage.setItem(storageKeyForConference(conf.code), raw);
  } catch {
    // ignore
  }
}

function appendUniqueLine(setter, value) {
  const text = (value || "").trim();
  if (!text) return;

  setter((prev) => {
    if (prev.length > 0 && prev[prev.length - 1] === text) {
      return prev;
    }
    return [...prev, text];
  });
}

function browserSttLang(srcLang) {
  if (srcLang === "rus_Cyrl") return "ru-RU";
  if (srcLang === "eng_Latn") return "en-US";
  if (srcLang === "deu_Latn") return "de-DE";
  if (srcLang === "fra_Latn") return "fr-FR";
  if (srcLang === "spa_Latn") return "es-ES";
  if (srcLang === "ita_Latn") return "it-IT";
  if (srcLang === "por_Latn") return "pt-PT";
  if (srcLang === "tur_Latn") return "tr-TR";
  return "en-US";
}

function pickDisplayName({ profile, user, isOrganizer }) {
  const candidate =
    profile?.full_name ||
    profile?.name ||
    profile?.username ||
    user?.full_name ||
    user?.name ||
    user?.display_name ||
    user?.username ||
    user?.email ||
    "";

  const normalized = String(candidate || "").trim();
  if (normalized) return normalized;
  return isOrganizer ? "Организатор" : "Участник";
}

function normalizeParticipants(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();

  return items
    .map((item, index) => {
      const clientId = String(item?.client_id || "").trim();
      if (!clientId || seen.has(clientId)) return null;
      seen.add(clientId);

      const displayName = String(item?.display_name || "").trim() || `Участник ${index + 1}`;
      return {
        client_id: clientId,
        display_name: displayName,
      };
    })
    .filter(Boolean);
}

function renderSubtitleLines(lines, partial) {
  return (
    <>
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} style={{ margin: "0 0 10px", color: "#f8fafc" }}>
          {line}
        </p>
      ))}
      {partial && <p style={{ margin: 0, color: "#38bdf8" }}>{partial}</p>}
      {lines.length === 0 && !partial && (
        <p style={{ ...mutedStyle, color: "#94a3b8" }}>Пока нет субтитров.</p>
      )}
    </>
  );
}

export function ConferenceRoomPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user, profile } = useAuth();

  const roleParam = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("role");
    } catch {
      return null;
    }
  }, [location.search]);

  const storedConference = useMemo(() => loadConferenceFromStorage(code), [code]);

  const conference = useMemo(() => {
    const stateConference = location.state?.conference || null;
    const base = stateConference || storedConference;
    const fallback = base || {
      code,
      title: "Конференция",
      is_organizer: roleParam === "organizer",
      target_language: "eng_Latn",
      src_language: "rus_Cyrl",
    };

    if (roleParam === "organizer") {
      return { ...fallback, is_organizer: true };
    }
    if (roleParam === "participant") {
      return { ...fallback, is_organizer: false };
    }
    return fallback;
  }, [code, location.state, roleParam, storedConference]);

  useEffect(() => {
    if (conference?.code) {
      saveConferenceToStorage(conference);
    }
  }, [conference]);

  const title = conference?.title ?? "Конференция";
  const isOrganizer = conference?.is_organizer ?? false;
  const srcLang = conference?.src_language ?? "rus_Cyrl";
  const tgtLang = conference?.target_language ?? "eng_Latn";

  const currentDisplayName = useMemo(
    () => pickDisplayName({ profile, user, isOrganizer }),
    [profile, user, isOrganizer],
  );

  const [originalLines, setOriginalLines] = useState([]);
  const [translatedLines, setTranslatedLines] = useState([]);
  const [originalPartial, setOriginalPartial] = useState("");
  const [translatedPartial, setTranslatedPartial] = useState("");
  const [confStatus, setConfStatus] = useState("active");
  const [micOn, setMicOn] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [localPreviewStream, setLocalPreviewStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);

  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const lastPartialSentRef = useRef("");
  const micOnRef = useRef(false);
  const participantIdsRef = useRef([]);
  const peerConnectionsRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const localScreenStreamRef = useRef(null);
  const localPreviewRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const originalListRef = useRef(null);
  const translatedListRef = useRef(null);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  useEffect(() => {
    participantIdsRef.current = participants.map((item) => item.client_id);
  }, [participants]);

  const sttLang = useMemo(() => browserSttLang(srcLang), [srcLang]);

  const sendJson = (payload) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  useEffect(() => {
    const video = localPreviewRef.current;
    if (!video) return;

    video.srcObject = localPreviewStream || null;

    if (localPreviewStream) {
      video.play().catch(() => {
        // ignore autoplay errors
      });
    }
  }, [localPreviewStream, screenShareActive]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;

    video.srcObject = remoteScreenStream || null;

    if (remoteScreenStream) {
      video.play().catch(() => {
        // ignore autoplay errors
      });
    }
  }, [remoteScreenStream, screenShareActive]);

  useEffect(() => {
    const node = originalListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [originalLines, originalPartial]);

  useEffect(() => {
    const node = translatedListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [translatedLines, translatedPartial]);

  const closePeerConnection = (peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (!pc) return;

    try {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    } catch {
      // ignore
    }

    peerConnectionsRef.current.delete(peerId);
    pendingIceCandidatesRef.current.delete(peerId);
  };

  const closeAllPeerConnections = () => {
    for (const peerId of Array.from(peerConnectionsRef.current.keys())) {
      closePeerConnection(peerId);
    }
  };

  const queueIceCandidate = (peerId, candidate) => {
    if (!candidate) return;
    const map = pendingIceCandidatesRef.current;
    const list = map.get(peerId) || [];
    list.push(candidate);
    map.set(peerId, list);
  };

  const flushPendingIceCandidates = async (peerId, pc) => {
    const list = pendingIceCandidatesRef.current.get(peerId) || [];
    if (!list.length) return;

    for (const candidate of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("ICE flush error", error);
      }
    }

    pendingIceCandidatesRef.current.delete(peerId);
  };

  const clearRemoteScreen = () => {
    setRemoteScreenStream(null);
    if (!isOrganizer) {
      closeAllPeerConnections();
    }
  };

  const ensurePeerConnection = (peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers: defaultIceServers() });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendJson({
        type: "webrtc_ice_candidate",
        target_client_id: peerId,
        candidate: event.candidate,
      });
    };

    pc.ontrack = (event) => {
      if (isOrganizer) return;
      const [stream] = event.streams || [];
      if (stream) {
        setRemoteScreenStream(stream);
        setScreenShareActive(true);
      }
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        if (!isOrganizer) {
          setRemoteScreenStream(null);
        }
      }
    };

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  };

  const attachStreamToPeer = async (pc, stream) => {
    for (const track of stream.getTracks()) {
      const sender = pc.getSenders().find((item) => item.track?.kind === track.kind);
      if (sender) {
        await sender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    }
  };

  const sendOfferToParticipant = async (participantId) => {
    const stream = localScreenStreamRef.current;
    if (!stream) return;

    const pc = ensurePeerConnection(participantId);
    await attachStreamToPeer(pc, stream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendJson({
      type: "webrtc_offer",
      target_client_id: participantId,
      sdp: offer,
    });
  };

  const stopRecognition = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
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

  const startRecognition = () => {
    if (!isOrganizer || !micOnRef.current || !socketReady) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUiError(
        "Ваш браузер не поддерживает SpeechRecognition. Используйте Chrome или Edge.",
      );
      return;
    }

    stopRecognition();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sttLang;

    recognition.onresult = (event) => {
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

    recognition.onerror = () => {
      if (!micOnRef.current || !socketReady) return;
      restartTimerRef.current = setTimeout(() => startRecognition(), 700);
    };

    recognition.onend = () => {
      if (!micOnRef.current || !socketReady) return;
      restartTimerRef.current = setTimeout(() => startRecognition(), 700);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setUiError("");
    } catch {
      restartTimerRef.current = setTimeout(() => startRecognition(), 700);
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

  const stopScreenShare = (notifyServer = true) => {
    const stream = localScreenStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.onended = null;
          track.stop();
        } catch {
          // ignore
        }
      }
    }

    localScreenStreamRef.current = null;
    setLocalPreviewStream(null);
    closeAllPeerConnections();
    setScreenShareActive(false);
    setScreenShareBusy(false);

    if (notifyServer) {
      sendJson({ type: "screen_share_stopped" });
    }
  };

  const startScreenShare = async () => {
    if (!isOrganizer) return;
    if (!socketReady) {
      setUiError("Сначала дождитесь подключения WebSocket.");
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setUiError("Ваш браузер не поддерживает демонстрацию экрана.");
      return;
    }

    setScreenShareBusy(true);
    setUiError("");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 15,
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      localScreenStreamRef.current = stream;
      setLocalPreviewStream(stream);
      setScreenShareActive(true);

      sendJson({ type: "screen_share_started" });

      for (const participantId of participantIdsRef.current) {
        await sendOfferToParticipant(participantId);
      }
    } catch (error) {
      console.error(error);
      setUiError(error?.message || "Не удалось начать демонстрацию экрана.");
      stopScreenShare(false);
    } finally {
      setScreenShareBusy(false);
    }
  };

  useEffect(() => {
    if (!code) return undefined;

    const ws = new WebSocket(conferenceWsUrl(code));
    wsRef.current = ws;

    ws.onopen = () => {
      setSocketReady(true);
      setUiError("");

      const joinMessage = {
        type: "join",
        role: isOrganizer ? "organizer" : "participant",
        display_name: currentDisplayName,
      };

      if (isOrganizer) {
        joinMessage.src_lang = srcLang;
      } else {
        joinMessage.tgt_lang = tgtLang;
      }

      ws.send(JSON.stringify(joinMessage));
    };

    ws.onerror = () => {
      setUiError("WebSocket соединение прервалось. Проверьте код конференции и обновите страницу.");
    };

    ws.onclose = () => {
      setSocketReady(false);
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "error") {
        setUiError(msg.message || "Ошибка соединения с конференцией.");
        return;
      }

      if (msg.type === "history") {
        const items = Array.isArray(msg.items) ? msg.items : [];
        setOriginalLines(items);
        setOriginalPartial("");
        setParticipants(normalizeParticipants(msg.participants));
        setScreenShareActive(Boolean(msg.screen_share_active));

        if (!isOrganizer) {
          if (
            Array.isArray(msg.translated_items) &&
            msg.translated_items.length === items.length
          ) {
            setTranslatedLines(msg.translated_items);
          } else {
            const translated = [];
            for (const line of items) {
              try {
                const result = await translateSegment(line, srcLang, tgtLang);
                translated.push(result.translated || "");
              } catch {
                translated.push("");
              }
            }
            setTranslatedLines(translated);
          }
          setTranslatedPartial("");
        }

        if (msg.is_active === false) {
          setConfStatus("ended");
        }
        return;
      }

      if (msg.type === "peer_list" && isOrganizer) {
        setParticipants(normalizeParticipants(msg.participants));
        return;
      }

      if (msg.type === "participant_joined" && isOrganizer) {
        const nextParticipantId = String(msg.participant_id || "").trim();
        const nextParticipantName = String(msg.participant_name || "").trim() || "Участник";

        if (!nextParticipantId) return;

        setParticipants((prev) => {
          if (prev.some((item) => item.client_id === nextParticipantId)) return prev;
          return [
            ...prev,
            {
              client_id: nextParticipantId,
              display_name: nextParticipantName,
            },
          ];
        });

        if (localScreenStreamRef.current) {
          try {
            await sendOfferToParticipant(nextParticipantId);
          } catch (error) {
            console.error(error);
          }
        }
        return;
      }

      if (msg.type === "participant_left" && isOrganizer) {
        const leftId = String(msg.participant_id || "").trim();
        setParticipants((prev) => prev.filter((item) => item.client_id !== leftId));
        closePeerConnection(leftId);
        return;
      }

      if (msg.type === "caption_partial") {
        setOriginalPartial((msg.text || "").trim());
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
              prev === (msg.translated || "") ? "" : prev,
            );
          } else {
            try {
              const result = await translateSegment(text, srcLang, tgtLang);
              appendUniqueLine(setTranslatedLines, result.translated || "");
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
        return;
      }

      if (msg.type === "screen_share_started") {
        setScreenShareActive(true);
        return;
      }

      if (msg.type === "screen_share_stopped") {
        setScreenShareActive(false);
        if (!isOrganizer) {
          clearRemoteScreen();
        }
        return;
      }

      if (msg.type === "organizer_left") {
        if (!isOrganizer) {
          setScreenShareActive(false);
          clearRemoteScreen();
          setUiError("Организатор отключился от конференции.");
        }
        return;
      }

      if (msg.type === "webrtc_offer" && !isOrganizer) {
        try {
          closePeerConnection(msg.from_client_id);
          const pc = ensurePeerConnection(msg.from_client_id);

          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushPendingIceCandidates(msg.from_client_id, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          sendJson({
            type: "webrtc_answer",
            target_client_id: msg.from_client_id,
            sdp: answer,
          });
        } catch (error) {
          console.error(error);
          setUiError("Не удалось принять демонстрацию экрана.");
        }
        return;
      }

      if (msg.type === "webrtc_answer" && isOrganizer) {
        try {
          const pc = ensurePeerConnection(msg.from_client_id);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await flushPendingIceCandidates(msg.from_client_id, pc);
        } catch (error) {
          console.error(error);
        }
        return;
      }

      if (msg.type === "webrtc_ice_candidate") {
        try {
          const pc = ensurePeerConnection(msg.from_client_id);

          if (!pc.remoteDescription) {
            queueIceCandidate(msg.from_client_id, msg.candidate);
            return;
          }

          if (msg.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
        } catch (error) {
          console.error(error);
        }
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
      setSocketReady(false);
    };
  }, [code, isOrganizer, srcLang, tgtLang, currentDisplayName]);

  useEffect(() => {
    return () => {
      stopMic();
      stopScreenShare(false);
      clearRemoteScreen();
    };
  }, []);

  const toggleMic = () => {
    if (!isOrganizer) return;
    if (micOn) {
      stopMic();
    } else {
      startMic();
    }
  };

  const doExport = (format) => {
    const originalText = [...originalLines, originalPartial].filter(Boolean).join("\n");
    const translatedText = [...translatedLines, translatedPartial]
      .filter(Boolean)
      .join("\n");

    downloadExport(code, format, srcLang, tgtLang, originalText, translatedText);
  };

  const handleSaveToSite = async () => {
    setUiError("");
    setUiSuccess("");

    try {
      setBusy(true);
      await createNote(
        {
          title: `Конференция ${code} — ${title}`,
          original_language: srcLang,
          target_language: tgtLang,
          original_text: [...originalLines, originalPartial].filter(Boolean).join("\n"),
          translated_text: [...translatedLines, translatedPartial]
            .filter(Boolean)
            .join("\n"),
        },
        token,
      );
      setUiSuccess("Сохранено в конспекты");
    } catch (error) {
      console.error(error);
      setUiError(error?.message || "Не удалось сохранить на сайте");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={pageStyle}>
      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            gap: 16,
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 28, color: "#f8fafc" }}>{title}</h1>
            <p style={mutedStyle}>
              Код конференции: <strong style={{ color: "#e2e8f0" }}>{code}</strong>
            </p>
            <p style={mutedStyle}>
              Роль: {isOrganizer ? "организатор" : "участник"}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={secondaryButtonStyle} onClick={() => doExport("docx")}>
              Экспорт DOCX
            </button>
            <button style={secondaryButtonStyle} onClick={() => doExport("pdf")}>
              Экспорт PDF
            </button>
            {!isOrganizer && (
              <button
                style={primaryButtonStyle}
                onClick={handleSaveToSite}
                disabled={busy}
              >
                Сохранить на сайте
              </button>
            )}
            <button style={secondaryButtonStyle} onClick={() => navigate("/conferences")}>
              Вернуться к конференциям
            </button>
          </div>
        </div>
      </section>

      {isOrganizer && (
        <section style={cardStyle}>
          <div style={{ display: "grid", gap: 12 }}>
            <h2 style={panelTitleStyle}>Управление конференцией</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={secondaryButtonStyle} onClick={toggleMic}>
                {micOn ? "Микрофон: ВЫКЛ" : "Микрофон: ВКЛ"}
              </button>
              <button
                style={screenShareActive ? dangerButtonStyle : primaryButtonStyle}
                onClick={screenShareActive ? () => stopScreenShare() : startScreenShare}
                disabled={screenShareBusy}
              >
                {screenShareActive ? "Остановить демонстрацию" : "Начать демонстрацию экрана"}
              </button>
              <button
                style={dangerButtonStyle}
                onClick={() => {
                  stopMic();
                  stopScreenShare();
                  sendJson({ type: "end" });
                }}
              >
                Завершить конференцию
              </button>
            </div>
          </div>
        </section>
      )}

      {screenShareActive && (
        <section style={cardStyle}>
          <div style={{ display: "grid", gap: 14 }}>
            <h2 style={panelTitleStyle}>
              {isOrganizer ? "Демонстрация организатора" : "Экран организатора"}
            </h2>

            <div style={videoWrapStyle}>
              {isOrganizer ? (
                <video
                  ref={localPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  style={videoStyle}
                />
              ) : (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  muted
                  playsInline
                  style={videoStyle}
                />
              )}
            </div>
          </div>
        </section>
      )}

      {isOrganizer && (
        <section style={cardStyle}>
          <div style={{ display: "grid", gap: 10 }}>
            <h2 style={panelTitleStyle}>Участники конференции</h2>
            {participants.length > 0 ? (
              <div style={participantListStyle}>
                {participants.map((item) => (
                  <div key={item.client_id} style={participantRowStyle}>
                    {item.display_name}
                  </div>
                ))}
              </div>
            ) : (
              <p style={mutedStyle}>Пока нет подключённых участников.</p>
            )}
          </div>
        </section>
      )}

      <section
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: !isOrganizer ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr",
        }}
      >
        <div style={cardStyle}>
          <div style={subtitlesCardContentStyle}>
            <h2 style={panelTitleStyle}>Субтитры</h2>
            <div ref={originalListRef} style={listCardStyle}>
              {renderSubtitleLines(originalLines, originalPartial)}
            </div>
          </div>
        </div>

        {!isOrganizer && (
          <div style={cardStyle}>
            <div style={subtitlesCardContentStyle}>
              <h2 style={panelTitleStyle}>Перевод</h2>
              <div ref={translatedListRef} style={listCardStyle}>
                {renderSubtitleLines(translatedLines, translatedPartial)}
              </div>
            </div>
          </div>
        )}
      </section>

      {uiError && (
        <section style={{ ...cardStyle, border: "1px solid rgba(248, 113, 113, 0.28)" }}>
          <p style={{ margin: 0, color: "#fecaca" }}>{uiError}</p>
        </section>
      )}

      {uiSuccess && (
        <section style={{ ...cardStyle, border: "1px solid rgba(74, 222, 128, 0.28)" }}>
          <p style={{ margin: 0, color: "#bbf7d0" }}>{uiSuccess}</p>
        </section>
      )}
    </div>
  );
}
