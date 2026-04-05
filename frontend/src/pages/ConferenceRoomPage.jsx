import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  conferenceWsUrl,
  defaultIceServers,
  downloadExport,
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

const iconButtonBaseStyle = {
  width: 46,
  minWidth: 46,
  height: 46,
  borderRadius: "50%",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.62)",
  color: "#e5eefc",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const iconButtonActiveStyle = {
  ...iconButtonBaseStyle,
  border: "1px solid rgba(96, 165, 250, 0.45)",
  background: "rgba(37, 99, 235, 0.18)",
};

const iconButtonDangerStyle = {
  ...iconButtonBaseStyle,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  color: "#fecaca",
};

const iconButtonDisabledStyle = {
  opacity: 0.45,
  cursor: "not-allowed",
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
  maxHeight: 260,
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
    // ignore storage errors
  }
}

function appendUniqueLine(setter, value) {
  const text = String(value || "").trim();
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

function pickDisplayName({ user, requestedRole }) {
  const authCandidate =
    user?.full_name ||
    user?.name ||
    user?.display_name ||
    user?.username ||
    user?.email ||
    "";

  const normalizedAuthCandidate = String(authCandidate || "").trim();
  if (normalizedAuthCandidate) {
    return normalizedAuthCandidate;
  }

  const profileName = localStorage.getItem("profile_display_name") || "";
  const profileEmail = localStorage.getItem("profile_email") || "";

  const fallbackCandidate = profileName || profileEmail || "";
  const normalizedFallback = String(fallbackCandidate || "").trim();

  if (normalizedFallback) {
    return normalizedFallback;
  }

  return requestedRole === "organizer" ? "Организатор" : "Участник";
}

function normalizePeers(items, selfClientId) {
  if (!Array.isArray(items)) return [];

  const seen = new Set();

  return items
    .map((item, index) => {
      const clientId = String(item?.client_id || "").trim();
      if (!clientId || clientId === selfClientId || seen.has(clientId)) return null;

      seen.add(clientId);

      return {
        client_id: clientId,
        display_name:
          String(item?.display_name || "").trim() || `Участник ${index + 1}`,
        role: String(item?.role || "").trim() || "participant",
      };
    })
    .filter(Boolean);
}

function renderSubtitleLines(lines, partial) {
  return (
    <>
      {lines.map((line, index) => (
        <div key={`${line}-${index}`}>{line}</div>
      ))}

      {partial && <div style={{ opacity: 0.85 }}>{partial}</div>}

      {lines.length === 0 && !partial && (
        <div style={{ color: "#94a3b8" }}>Пока нет субтитров.</div>
      )}
    </>
  );
}

function MicrophoneOnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <path
        d="M6 10.5C6 13.8137 8.68629 16.5 12 16.5C15.3137 16.5 18 13.8137 18 10.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 16.5V21"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M9 21H15"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicrophoneOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <path
        d="M6 10.5C6 13.8137 8.68629 16.5 12 16.5C13.6737 16.5 15.1873 15.8148 16.2754 14.7098"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 16.5V21"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M9 21H15"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M4 4L20 20"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="12"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      <path
        d="M8 21H16"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 17V21"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 9V13"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M10.5 10.5L12 9L13.5 10.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 7L15 12L10 17"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 12H4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M13 4H17C18.1046 4 19 4.89543 19 6V18C19 19.1046 18.1046 20 17 20H13"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EndConferenceIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 8L16 16"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M16 8L8 16"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function IconButton({
  title,
  onClick,
  disabled = false,
  active = false,
  danger = false,
  children,
}) {
  let style = iconButtonBaseStyle;

  if (danger) {
    style = iconButtonDangerStyle;
  } else if (active) {
    style = iconButtonActiveStyle;
  }

  if (disabled) {
    style = { ...style, ...iconButtonDisabledStyle };
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}

export function ConferenceRoomPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const roleParam = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("role");
    } catch {
      return null;
    }
  }, [location.search]);

  const storedConference = useMemo(() => loadConferenceFromStorage(code), [code]);
  const initialConference = useMemo(() => {
    const stateConference = location.state?.conference || null;
    const base = stateConference || storedConference;

    return (
      base || {
        code,
        title: "Конференция",
        is_organizer: roleParam === "organizer",
        target_language: "eng_Latn",
        src_language: "rus_Cyrl",
      }
    );
  }, [code, location.state, roleParam, storedConference]);

  const initialRequestedRole =
    roleParam === "organizer"
      ? "organizer"
      : roleParam === "participant"
        ? "participant"
        : initialConference?.is_organizer
          ? "organizer"
          : "participant";

  const [requestedRole] = useState(initialRequestedRole);
  const [isOrganizer, setIsOrganizer] = useState(requestedRole === "organizer");
  const [conferenceMeta, setConferenceMeta] = useState(initialConference);

  const title = conferenceMeta?.title ?? "Конференция";
  const srcLang = conferenceMeta?.src_language ?? "rus_Cyrl";
  const tgtLang = conferenceMeta?.target_language ?? "eng_Latn";

  const currentDisplayName = useMemo(
    () => pickDisplayName({ user, requestedRole }),
    [requestedRole, user],
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

  const [peers, setPeers] = useState([]);
  const [myClientId, setMyClientId] = useState("");
  const [screenShareActive, setScreenShareActive] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [screenShareOwnerId, setScreenShareOwnerId] = useState(null);
  const [screenShareOwnerName, setScreenShareOwnerName] = useState("");
  const [localPreviewStream, setLocalPreviewStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [isInConference, setIsInConference] = useState(true);
  const [hasLeftConference, setHasLeftConference] = useState(false);

  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const lastPartialSentRef = useRef("");
  const micOnRef = useRef(false);
  const peerIdsRef = useRef([]);
  const myClientIdRef = useRef("");
  const screenShareOwnerIdRef = useRef(null);
  const intentionalDisconnectRef = useRef(false);

  const peerConnectionsRef = useRef(new Map());
  const pendingIceCandidatesRef = useRef(new Map());
  const localScreenStreamRef = useRef(null);

  const localPreviewRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const originalListRef = useRef(null);
  const translatedListRef = useRef(null);

  const sttLang = useMemo(() => browserSttLang(srcLang), [srcLang]);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  useEffect(() => {
    myClientIdRef.current = myClientId;
  }, [myClientId]);

  useEffect(() => {
    screenShareOwnerIdRef.current = screenShareOwnerId;
  }, [screenShareOwnerId]);

  useEffect(() => {
    peerIdsRef.current = peers.map((item) => item.client_id);
  }, [peers]);

  useEffect(() => {
    saveConferenceToStorage({
      ...conferenceMeta,
      code,
      title,
      is_organizer: isOrganizer,
      target_language: tgtLang,
      src_language: srcLang,
    });
  }, [code, conferenceMeta, isOrganizer, srcLang, tgtLang, title]);

  const visibleParticipants = useMemo(
    () => peers.filter((peer) => peer.role === "participant"),
    [peers],
  );

  const showScreenShareSection = Boolean(
    screenShareActive || screenShareBusy || localPreviewStream || remoteScreenStream,
  );

  const showParticipantPostActions = Boolean(
    !isOrganizer && (confStatus === "ended" || hasLeftConference),
  );

  const canUseLiveControls = Boolean(isInConference && confStatus !== "ended");

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
  }, [localPreviewStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;

    video.srcObject = remoteScreenStream || null;
    if (remoteScreenStream) {
      video.play().catch(() => {
        // ignore autoplay errors
      });
    }
  }, [remoteScreenStream]);

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
    closeAllPeerConnections();
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
      const [stream] = event.streams || [];
      if (!stream) return;

      setRemoteScreenStream(stream);
      setScreenShareActive(true);
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        if (screenShareOwnerIdRef.current !== myClientIdRef.current) {
          setRemoteScreenStream(null);
        }
      }
    };

    peerConnectionsRef.current.set(peerId, pc);
    return pc;
  };

  const attachStreamToPeer = async (pc, stream) => {
    for (const track of stream.getTracks()) {
      const sender = pc
        .getSenders()
        .find((item) => item.track?.kind === track.kind);

      if (sender) {
        await sender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    }
  };

  const sendOfferToPeer = async (peerId) => {
    const stream = localScreenStreamRef.current;
    if (!stream) return;

    const pc = ensurePeerConnection(peerId);
    await attachStreamToPeer(pc, stream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendJson({
      type: "webrtc_offer",
      target_client_id: peerId,
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
    if (!micOnRef.current || !socketReady) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setUiError(
        "Ваш браузер не поддерживает SpeechRecognition. Используйте Chrome или Edge.",
      );
      return;
    }

    stopRecognition();

    const recognition = new SpeechRecognition();
    recognition.lang = sttLang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimText = "";
      const finalChunks = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = String(result?.[0]?.transcript || "").trim();

        if (!transcript) continue;

        if (result.isFinal) {
          finalChunks.push(transcript);
        } else {
          interimText += `${interimText ? " " : ""}${transcript}`;
        }
      }

      const normalizedInterim = interimText.trim();
      if (lastPartialSentRef.current !== normalizedInterim) {
        lastPartialSentRef.current = normalizedInterim;
        sendJson({ type: "segment_partial", text: normalizedInterim });
      }

      const finalText = finalChunks.join(" ").trim();
      if (finalText) {
        sendJson({ type: "segment_final", text: finalText });
        lastPartialSentRef.current = "";
        sendJson({ type: "segment_partial", text: "" });
      }
    };

    recognition.onerror = (event) => {
      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        setUiError("Нет доступа к микрофону. Разрешите доступ в браузере.");
        micOnRef.current = false;
        setMicOn(false);
        return;
      }

      if (event?.error === "no-speech") {
        return;
      }

      console.error("SpeechRecognition error", event);
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (micOnRef.current && socketReady) {
        restartTimerRef.current = window.setTimeout(() => {
          startRecognition();
        }, 400);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      console.error(error);
    }
  };

  const startMic = () => {
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
    setTranslatedPartial("");
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

    if (screenShareOwnerIdRef.current === myClientIdRef.current) {
      setScreenShareOwnerId(null);
      setScreenShareOwnerName("");
      setScreenShareActive(false);
    }

    setScreenShareBusy(false);

    if (notifyServer && myClientIdRef.current) {
      sendJson({ type: "screen_share_stopped" });
    }
  };

  const startScreenShare = async () => {
    if (!socketReady) {
      setUiError("Сначала дождитесь подключения WebSocket.");
      return;
    }

    if (
      screenShareOwnerIdRef.current &&
      screenShareOwnerIdRef.current !== myClientIdRef.current
    ) {
      setUiError("Сейчас экран уже демонстрирует другой участник.");
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
      setRemoteScreenStream(null);
      setScreenShareOwnerId(myClientIdRef.current || "self");
      setScreenShareOwnerName(currentDisplayName);
      setScreenShareActive(true);

      sendJson({ type: "screen_share_started" });

      for (const peerId of peerIdsRef.current) {
        await sendOfferToPeer(peerId);
      }
    } catch (error) {
      console.error(error);
      setUiError(error?.message || "Не удалось начать демонстрацию экрана.");
      stopScreenShare(false);
    } finally {
      setScreenShareBusy(false);
    }
  };

  const disconnectFromConference = () => {
    intentionalDisconnectRef.current = true;

    stopMic();
    stopScreenShare(false);
    clearRemoteScreen();

    setSocketReady(false);
    setScreenShareActive(false);
    setScreenShareOwnerId(null);
    setScreenShareOwnerName("");
    setLocalPreviewStream(null);
    setRemoteScreenStream(null);
    setPeers([]);
    setMyClientId("");

    if (wsRef.current) {
      try {
        wsRef.current.close(1000, "leave");
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    setIsInConference(false);
  };

  useEffect(() => {
    if (!code || !isInConference) return undefined;

    intentionalDisconnectRef.current = false;

    const ws = new WebSocket(conferenceWsUrl(code));
    wsRef.current = ws;

    ws.onopen = () => {
      setSocketReady(true);
      setUiError("");

      ws.send(
        JSON.stringify({
          type: "join",
          role: requestedRole,
          display_name: currentDisplayName,
          src_lang: srcLang,
          tgt_lang: tgtLang,
          auth_token: token || "",
        }),
      );
    };

    ws.onerror = () => {
      if (intentionalDisconnectRef.current) return;

      setUiError(
        "WebSocket соединение прервалось. Проверьте код конференции и обновите страницу.",
      );
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
        const translated = Array.isArray(msg.translated_items)
          ? msg.translated_items
          : [];

        setOriginalLines(items);
        setTranslatedLines(translated);
        setOriginalPartial("");
        setTranslatedPartial("");

        if (msg.is_active === false) {
          setConfStatus("ended");
        } else {
          setConfStatus("active");
        }

        if (msg.src_lang) {
          setConferenceMeta((prev) => ({
            ...prev,
            src_language: msg.src_lang,
          }));
        }

        const nextMyClientId = String(msg.client_id || "").trim();
        setMyClientId(nextMyClientId);

        const joinedRole = String(msg.joined_role || "").trim();
        if (joinedRole) {
          setIsOrganizer(joinedRole === "organizer");
        }

        setPeers(normalizePeers(msg.participants, nextMyClientId));

        const nextOwnerId = String(msg.screen_share_owner_id || "").trim();
        const nextOwnerName = String(msg.screen_share_owner_name || "").trim();

        setScreenShareOwnerId(nextOwnerId || null);
        setScreenShareOwnerName(nextOwnerName);
        setScreenShareActive(Boolean(msg.screen_share_active));

        if (nextOwnerId && nextOwnerId !== nextMyClientId) {
          setLocalPreviewStream(null);
        }

        return;
      }

      if (msg.type === "peer_list") {
        setPeers(normalizePeers(msg.participants, myClientIdRef.current));

        const nextOwnerId = String(msg.screen_share_owner_id || "").trim();
        const nextOwnerName = String(msg.screen_share_owner_name || "").trim();

        setScreenShareOwnerId(nextOwnerId || null);
        setScreenShareOwnerName(nextOwnerName);
        setScreenShareActive(Boolean(msg.screen_share_active));

        return;
      }

      if (msg.type === "caption_partial") {
        setOriginalPartial(String(msg.display_text || "").trim());
        setTranslatedPartial(String(msg.translated_display_text || "").trim());
        return;
      }

      if (msg.type === "caption_final" || msg.type === "segment") {
        const originalDisplay = String(msg.display_text || "").trim();
        const translatedDisplay = String(msg.translated_display_text || "").trim();

        if (originalDisplay) {
          appendUniqueLine(setOriginalLines, originalDisplay);
        }

        if (translatedDisplay) {
          appendUniqueLine(setTranslatedLines, translatedDisplay);
        }

        setOriginalPartial("");
        setTranslatedPartial("");
        return;
      }

      if (msg.type === "ended") {
        setConfStatus("ended");
        setOriginalPartial("");
        setTranslatedPartial("");
        return;
      }

      if (msg.type === "screen_share_started") {
        const ownerId = String(msg.owner_client_id || "").trim();
        const ownerName = String(msg.owner_display_name || "").trim();

        setScreenShareOwnerId(ownerId || null);
        setScreenShareOwnerName(ownerName);
        setScreenShareActive(true);

        if (ownerId && ownerId !== myClientIdRef.current) {
          setLocalPreviewStream(null);
        }

        return;
      }

      if (msg.type === "screen_share_stopped") {
        const ownerId = String(msg.owner_client_id || "").trim();

        if (ownerId && ownerId === myClientIdRef.current) {
          setScreenShareOwnerId(null);
          setScreenShareOwnerName("");
          setScreenShareActive(false);
          return;
        }

        setScreenShareOwnerId(null);
        setScreenShareOwnerName("");
        setScreenShareActive(false);
        clearRemoteScreen();
        return;
      }

      if (msg.type === "organizer_left") {
        if (!isOrganizer) {
          setUiError("Организатор отключился от конференции.");
        }
        return;
      }

      if (msg.type === "webrtc_offer") {
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
        }

        return;
      }

      if (msg.type === "webrtc_answer") {
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
        const candidate = msg.candidate;
        const peerId = String(msg.from_client_id || "").trim();
        if (!peerId || !candidate) return;

        const pc = peerConnectionsRef.current.get(peerId);
        if (!pc || !pc.remoteDescription) {
          queueIceCandidate(peerId, candidate);
          return;
        }

        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error(error);
        }
      }
    };

    return () => {
      stopRecognition();
      stopScreenShare(false);
      clearRemoteScreen();

      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [code, currentDisplayName, isInConference, isOrganizer, requestedRole, srcLang, tgtLang, token]);

  useEffect(() => {
    if (socketReady && micOnRef.current && !recognitionRef.current) {
      startRecognition();
    }
  }, [socketReady, sttLang]);

  const isMyScreenShare = Boolean(
    screenShareOwnerId && screenShareOwnerId === myClientId,
  );

  const handleMicToggle = () => {
    if (micOn) {
      stopMic();
      return;
    }

    startMic();
  };

  const handleScreenShareToggle = async () => {
    if (isMyScreenShare && localScreenStreamRef.current) {
      stopScreenShare();
      return;
    }

    await startScreenShare();
  };

  const handleEndConference = () => {
    if (!isOrganizer) return;

    sendJson({ type: "end" });
    setConfStatus("ended");
    setScreenShareActive(false);
    stopMic();
    stopScreenShare(false);
  };

  const handleLeaveConference = () => {
    if (isOrganizer) return;

    setUiError("");
    disconnectFromConference();
    setHasLeftConference(true);
    setUiSuccess("Вы вышли из конференции. Теперь можно сохранить или экспортировать конспект.");
  };

  const handleExport = (format) => {
    const originalText = [...originalLines, originalPartial]
      .filter(Boolean)
      .join("\n");
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
          original_text: [...originalLines, originalPartial]
            .filter(Boolean)
            .join("\n"),
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
          <div style={{ display: "grid", gap: 12, flex: 1, minWidth: 280 }}>
            <div>
              <h1 style={{ ...panelTitleStyle, fontSize: 28 }}>{title}</h1>
              <p style={mutedStyle}>
                Код: <b>{code}</b> · Роль:{" "}
                <b>{isOrganizer ? "организатор" : "участник"}</b>
              </p>

              {!isOrganizer && (
                <p style={mutedStyle}>
                  Язык перевода: <b>{langHuman(tgtLang)}</b>
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {canUseLiveControls && (
                <>
                  <IconButton
                    title={micOn ? "Выключить микрофон" : "Включить микрофон"}
                    onClick={handleMicToggle}
                    active={micOn}
                    disabled={!socketReady}
                  >
                    {micOn ? <MicrophoneOnIcon /> : <MicrophoneOffIcon />}
                  </IconButton>

                  <IconButton
                    title={
                      isMyScreenShare
                        ? "Остановить демонстрацию экрана"
                        : "Включить демонстрацию экрана"
                    }
                    onClick={handleScreenShareToggle}
                    active={isMyScreenShare}
                    disabled={
                      !socketReady ||
                      screenShareBusy ||
                      (
                        screenShareOwnerId &&
                        screenShareOwnerId !== myClientId &&
                        !isMyScreenShare
                      )
                    }
                  >
                    <ScreenShareIcon />
                  </IconButton>
                </>
              )}

              {isOrganizer && isInConference && confStatus !== "ended" && (
                <IconButton
                  title="Завершить конференцию"
                  onClick={handleEndConference}
                  danger
                >
                  <EndConferenceIcon />
                </IconButton>
              )}

              {!isOrganizer && isInConference && (
                <IconButton
                  title="Выйти из конференции"
                  onClick={handleLeaveConference}
                  danger
                >
                  <ExitIcon />
                </IconButton>
              )}

              {showParticipantPostActions && (
                <>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => handleExport("docx")}
                  >
                    Экспорт DOCX
                  </button>

                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => handleExport("pdf")}
                  >
                    Экспорт PDF
                  </button>

                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={handleSaveToSite}
                    disabled={busy}
                  >
                    {busy ? "Сохраняем..." : "Сохранить на сайте"}
                  </button>
                </>
              )}

              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => navigate("/conferences")}
              >
                Назад
              </button>
            </div>

            {screenShareOwnerId && screenShareOwnerId !== myClientId && (
              <p style={mutedStyle}>
                Сейчас экран демонстрирует: <b>{screenShareOwnerName || "участник"}</b>
              </p>
            )}

            {screenShareBusy && (
              <p style={mutedStyle}>Подготавливаем демонстрацию экрана…</p>
            )}

            {confStatus === "ended" && (
              <div className="conference-message conference-message_error">
                Конференция завершена.
              </div>
            )}

            {uiError && (
              <div className="conference-message conference-message_error">
                {uiError}
              </div>
            )}

            {uiSuccess && (
              <div className="conference-message conference-message_success">
                {uiSuccess}
              </div>
            )}
          </div>

          {isOrganizer && (
            <div style={{ minWidth: 240, maxWidth: 320 }}>
              <h2 style={panelTitleStyle}>Участники</h2>

              <div style={{ ...listCardStyle, marginTop: 12 }}>
                <div style={participantListStyle}>
                  {visibleParticipants.length === 0 && (
                    <div style={{ color: "#94a3b8" }}>
                      Пока нет подключённых участников.
                    </div>
                  )}

                  {visibleParticipants.map((peer) => (
                    <div key={peer.client_id} style={participantRowStyle}>
                      <div style={{ fontWeight: 700 }}>{peer.display_name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {showScreenShareSection && (
        <section style={cardStyle}>
          <div style={videoWrapStyle}>
            {isMyScreenShare && localPreviewStream ? (
              <>
                <h2 style={{ ...panelTitleStyle, marginBottom: 12 }}>
                  Ваша демонстрация экрана
                </h2>
                <video
                  ref={localPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  style={videoStyle}
                />
              </>
            ) : remoteScreenStream ? (
              <>
                <h2 style={{ ...panelTitleStyle, marginBottom: 12 }}>
                  Демонстрация экрана: {screenShareOwnerName || "участник"}
                </h2>
                <video ref={remoteVideoRef} autoPlay playsInline style={videoStyle} />
              </>
            ) : (
              <>
                <h2 style={{ ...panelTitleStyle, marginBottom: 12 }}>
                  Демонстрация экрана
                </h2>
                <div
                  style={{
                    ...videoStyle,
                    display: "grid",
                    placeItems: "center",
                    color: "#94a3b8",
                    padding: 24,
                  }}
                >
                  Ждём подключение видеопотока…
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
        }}
      >
        <article style={cardStyle}>
          <h2 style={panelTitleStyle}>Оригинальные субтитры</h2>

          <div ref={originalListRef} style={{ ...listCardStyle, marginTop: 14 }}>
            {renderSubtitleLines(originalLines, originalPartial)}
          </div>
        </article>

        <article style={cardStyle}>
          <h2 style={panelTitleStyle}>Перевод</h2>

          <div ref={translatedListRef} style={{ ...listCardStyle, marginTop: 14 }}>
            {renderSubtitleLines(translatedLines, translatedPartial)}
          </div>
        </article>
      </section>
    </div>
  );
}
