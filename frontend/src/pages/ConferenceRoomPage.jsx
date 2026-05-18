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

const participantTilesGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 18,
  alignItems: "flex-start",
};

const participantTileStyle = {
  width: 260,
  minWidth: 260,
  height: 190,
  flex: "0 0 260px",
  borderRadius: 26,
  border: "1px solid rgba(96, 165, 250, 0.3)",
  background:
    "linear-gradient(135deg, rgba(30, 64, 175, 0.4), rgba(15, 23, 42, 0.78))",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  padding: 20,
  textAlign: "center",
  boxShadow: "0 18px 36px rgba(2, 6, 23, 0.26)",
  boxSizing: "border-box",
};

const participantAvatarStyle = {
  width: 74,
  height: 74,
  borderRadius: 24,
  background: "rgba(96, 165, 250, 0.26)",
  border: "1px solid rgba(191, 219, 254, 0.28)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 30,
  fontWeight: 800,
  color: "#dbeafe",
  flex: "0 0 auto",
};

const statusStyle = {
  borderRadius: 18,
  padding: "12px 14px",
  border: "1px solid rgba(96, 165, 250, 0.24)",
  background: "rgba(30, 64, 175, 0.16)",
  color: "#bfdbfe",
};

const errorStyle = {
  borderRadius: 18,
  padding: "12px 14px",
  border: "1px solid rgba(248, 113, 113, 0.32)",
  background: "rgba(127, 29, 29, 0.2)",
  color: "#fecaca",
  whiteSpace: "pre-line",
};

const successStyle = {
  borderRadius: 18,
  padding: "12px 14px",
  border: "1px solid rgba(74, 222, 128, 0.32)",
  background: "rgba(22, 101, 52, 0.2)",
  color: "#bbf7d0",
  whiteSpace: "pre-line",
};

const subtitlesGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

function langHuman(code) {
  if (!code) return "—";
  return LANG_NAME[code] || code;
}

function storageKeyForConference(code) {
  return `conference:${code}`;
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function nameFromEmail(value) {
  const raw = String(value || "").trim();

  if (!raw || !raw.includes("@")) {
    return "";
  }

  return raw.split("@")[0].replace(/[._-]+/g, " ").trim();
}

function cleanVisibleName(value, fallback = "Участник") {
  const raw = String(value || "").trim();

  if (!raw) {
    return fallback;
  }

  if (raw.includes("@")) {
    return nameFromEmail(raw) || fallback;
  }

  return raw;
}

function getInitials(value) {
  const cleaned = cleanVisibleName(value, "У");
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return (cleaned[0] || "У").toUpperCase();
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
  const profileName = safeStorageGet("profile_display_name").trim();

  if (profileName) {
    return profileName;
  }

  const authCandidate =
    user?.full_name || user?.name || user?.display_name || user?.username || "";

  const normalizedAuthCandidate = String(authCandidate || "").trim();

  if (normalizedAuthCandidate) {
    return cleanVisibleName(normalizedAuthCandidate);
  }

  const profileEmailName = nameFromEmail(safeStorageGet("profile_email"));

  if (profileEmailName) {
    return profileEmailName;
  }

  const authEmailName = nameFromEmail(user?.email);

  if (authEmailName) {
    return authEmailName;
  }

  return requestedRole === "organizer" ? "Организатор" : "Участник";
}

function normalizePeers(items, selfClientId) {
  if (!Array.isArray(items)) return [];

  const seen = new Set();

  return items
    .map((item, index) => {
      const clientId = String(item?.client_id || "").trim();

      if (!clientId || clientId === selfClientId || seen.has(clientId)) {
        return null;
      }

      seen.add(clientId);

      return {
        client_id: clientId,
        display_name: cleanVisibleName(
          item?.display_name,
          `Участник ${index + 1}`,
        ),
        role: String(item?.role || "").trim() || "participant",
      };
    })
    .filter(Boolean);
}

function renderSubtitleLines(lines, partial) {
  return (
    <>
      {lines.map((line, index) => (
        <p
          key={`${line}-${index}`}
          style={{ margin: "0 0 10px", color: "#f8fafc" }}
        >
          {line}
        </p>
      ))}

      {partial && (
        <p style={{ margin: 0, color: "#bfdbfe", fontStyle: "italic" }}>
          {partial}
        </p>
      )}

      {lines.length === 0 && !partial && (
        <p style={mutedStyle}>Пока нет субтитров.</p>
      )}
    </>
  );
}

function SvgIcon({ children }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function MicrophoneOnIcon() {
  return (
    <SvgIcon>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
    </SvgIcon>
  );
}

function MicrophoneOffIcon() {
  return (
    <SvgIcon>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M15 9.34V6a3 3 0 0 0-5.67-1.37" />
      <path d="M19 10v2a7 7 0 0 1-.8 3.25" />
      <path d="M5 10v2a7 7 0 0 0 10 6.32" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
      <path d="M3 3l18 18" />
    </SvgIcon>
  );
}

function ScreenShareIcon() {
  return (
    <SvgIcon>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
      <path d="M8 10l4-4 4 4" />
      <path d="M12 6v7" />
    </SvgIcon>
  );
}

function ExitIcon() {
  return (
    <SvgIcon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </SvgIcon>
  );
}

function EndConferenceIcon() {
  return (
    <SvgIcon>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 3.41l2.27-2.27a1.5 1.5 0 0 1 1.55-.36 11.36 11.36 0 0 0 3.56.57A1.5 1.5 0 0 1 23 16.16v3.59A1.5 1.5 0 0 1 21.5 21 19.5 19.5 0 0 1 3 2.5 1.5 1.5 0 0 1 4.5 1h3.59a1.5 1.5 0 0 1 1.5 1.53 11.36 11.36 0 0 0 .57 3.56 1.5 1.5 0 0 1-.36 1.55L7.53 9.91" />
      <path d="M3 21L21 3" />
    </SvgIcon>
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
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}

function ParticipantTiles({ participants }) {
  return (
    <section style={cardStyle}>
      <div style={{ display: "grid", gap: 18 }}>
        <div>
          <h2 style={panelTitleStyle}>Участники конференции</h2>

        </div>

        <div style={participantTilesGridStyle}>
          {participants.length === 0 ? (
            <div style={participantTileStyle}>
              <div style={participantAvatarStyle}>—</div>
              <strong style={{ fontSize: 19 }}>Пока нет участников</strong>
              <span style={{ color: "#bfdbfe", fontSize: 15 }}>
                Ожидание подключения
              </span>
            </div>
          ) : (
            participants.map((peer, index) => {
              const displayName = cleanVisibleName(
                peer.display_name,
                `Участник ${index + 1}`,
              );

              return (
                <div key={peer.client_id} style={participantTileStyle}>
                  <div style={participantAvatarStyle}>
                    {getInitials(displayName)}
                  </div>

                  <strong
                    style={{
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 20,
                    }}
                    title={displayName}
                  >
                    {displayName}
                  </strong>


                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
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

  const visibleParticipants = useMemo(
    () => peers.filter((peer) => peer.role === "participant"),
    [peers],
  );

  const showScreenShareSection = Boolean(
    screenShareActive ||
      screenShareBusy ||
      localPreviewStream ||
      remoteScreenStream,
  );

  const showParticipantPostActions = Boolean(
    !isOrganizer && (confStatus === "ended" || hasLeftConference),
  );

  const canUseLiveControls = Boolean(isInConference && confStatus !== "ended");

  const sendJson = (payload) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

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
        "Ваш браузер не поддерживает SpeechRecognition.\nИспользуйте Chrome или Edge.",
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
      if (
        event?.error === "not-allowed" ||
        event?.error === "service-not-allowed"
      ) {
        setUiError("Нет доступа к микрофону.\nРазрешите доступ в браузере.");
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
      setUiError("WebSocket ещё не готов.\nПодождите секунду и попробуйте снова.");
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
        "WebSocket соединение прервалось.\nПроверьте код конференции и обновите страницу.",
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
        const nextOwnerName = cleanVisibleName(
          msg.screen_share_owner_name,
          "участник",
        );

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
        const nextOwnerName = cleanVisibleName(
          msg.screen_share_owner_name,
          "участник",
        );

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
        const translatedDisplay = String(
          msg.translated_display_text || "",
        ).trim();

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
        const ownerName = cleanVisibleName(msg.owner_display_name, "участник");

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
  }, [
    code,
    currentDisplayName,
    isInConference,
    isOrganizer,
    requestedRole,
    srcLang,
    tgtLang,
    token,
  ]);

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
    setUiSuccess(
      "Вы вышли из конференции.\nТеперь можно сохранить или экспортировать конспект.",
    );
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
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, color: "#f8fafc", fontSize: 30 }}>
              {title}
            </h1>

            <p style={{ ...mutedStyle, marginTop: 8 }}>
              Код: <strong style={{ color: "#e5eefc" }}>{code}</strong> · Роль:{" "}
              {isOrganizer ? "организатор" : "участник"}
            </p>

            {!isOrganizer && (
              <p style={{ ...mutedStyle, marginTop: 4 }}>
                Язык перевода: {langHuman(tgtLang)}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {canUseLiveControls && (
              <>
                <IconButton
                  title={micOn ? "Выключить микрофон" : "Включить микрофон"}
                  onClick={handleMicToggle}
                  active={micOn}
                >
                  {micOn ? <MicrophoneOnIcon /> : <MicrophoneOffIcon />}
                </IconButton>

                <IconButton
                  title={
                    isMyScreenShare
                      ? "Остановить демонстрацию экрана"
                      : "Начать демонстрацию экрана"
                  }
                  onClick={handleScreenShareToggle}
                  active={isMyScreenShare}
                  disabled={screenShareBusy}
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
              >
                <ExitIcon />
              </IconButton>
            )}

            {showParticipantPostActions && (
              <>
                <button
                  type="button"
                  onClick={() => handleExport("docx")}
                  style={secondaryButtonStyle}
                >
                  Экспорт DOCX
                </button>

                <button
                  type="button"
                  onClick={() => handleExport("pdf")}
                  style={secondaryButtonStyle}
                >
                  Экспорт PDF
                </button>

                <button
                  type="button"
                  onClick={handleSaveToSite}
                  disabled={busy}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: busy ? 0.65 : 1,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  {busy ? "Сохраняем..." : "Сохранить на сайте"}
                </button>
              </>
            )}


          </div>
        </div>
      </section>

      {screenShareOwnerId && screenShareOwnerId !== myClientId && (
        <div style={statusStyle}>
          Сейчас экран демонстрирует:{" "}
          {cleanVisibleName(screenShareOwnerName, "участник")}
        </div>
      )}

      {screenShareBusy && (
        <div style={statusStyle}>Подготавливаем демонстрацию экрана…</div>
      )}

      {confStatus === "ended" && (
        <div style={statusStyle}>Конференция завершена.</div>
      )}

      {uiError && <div style={errorStyle}>{uiError}</div>}

      {uiSuccess && <div style={successStyle}>{uiSuccess}</div>}


      {showScreenShareSection && (
        <section style={cardStyle}>
          {isMyScreenShare && localPreviewStream ? (
            <>
              <h2 style={{ ...panelTitleStyle, marginBottom: 14 }}>
                Ваша демонстрация экрана
              </h2>

              <div style={videoWrapStyle}>
                <video ref={localPreviewRef} muted playsInline style={videoStyle} />
              </div>
            </>
          ) : remoteScreenStream ? (
            <>
              <h2 style={{ ...panelTitleStyle, marginBottom: 14 }}>
                Демонстрация экрана:{" "}
                {cleanVisibleName(screenShareOwnerName, "участник")}
              </h2>

              <div style={videoWrapStyle}>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={videoStyle}
                />
              </div>
            </>
          ) : (
            <>
              <h2 style={panelTitleStyle}>Демонстрация экрана</h2>
              <p style={{ ...mutedStyle, marginTop: 8 }}>
                Ждём подключение видеопотока…
              </p>
            </>
          )}
        </section>
      )}

      {isOrganizer ? (
        <ParticipantTiles participants={visibleParticipants} />
      ) : (
        <section style={subtitlesGridStyle}>
          <div style={cardStyle}>
            <h2 style={{ ...panelTitleStyle, marginBottom: 12 }}>
              Оригинальные субтитры
            </h2>

            <div ref={originalListRef} style={listCardStyle}>
              {renderSubtitleLines(originalLines, originalPartial)}
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ ...panelTitleStyle, marginBottom: 12 }}>Перевод</h2>

            <div ref={translatedListRef} style={listCardStyle}>
              {renderSubtitleLines(translatedLines, translatedPartial)}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
