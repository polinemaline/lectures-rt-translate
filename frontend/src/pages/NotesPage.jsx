import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  deleteNote,
  downloadNoteExport,
  fetchNotes,
  updateNote,
} from "../services/notesService";

function clip(text, n = 140) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

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
  if (!code) return null;
  return LANG_NAME[code] || code;
}

function langPair(a, b) {
  const aa = langHuman(a);
  const bb = langHuman(b);
  if (!aa && !bb) return null;
  if (aa && bb) return `${aa} → ${bb}`;
  return aa || bb;
}

function createDraftFromNote(note) {
  return {
    title: note?.title || "",
    originalText: note?.original_text || "",
    translatedText: note?.translated_text || "",
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(text) {
  let s = escapeHtml(text);

  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  );
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return s;
}

function renderMarkdown(text) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (/^###\s+/.test(line)) {
      blocks.push(`<h3>${renderInlineMarkdown(line.replace(/^###\s+/, ""))}</h3>`);
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      blocks.push(`<h2>${renderInlineMarkdown(line.replace(/^##\s+/, ""))}</h2>`);
      i += 1;
      continue;
    }

    if (/^#\s+/.test(line)) {
      blocks.push(`<h1>${renderInlineMarkdown(line.replace(/^#\s+/, ""))}</h1>`);
      i += 1;
      continue;
    }

    if (/^>\s+/.test(line)) {
      blocks.push(
        `<blockquote>${renderInlineMarkdown(line.replace(/^>\s+/, ""))}</blockquote>`
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(
          `<li>${renderInlineMarkdown(lines[i].trim().replace(/^[-*]\s+/, ""))}</li>`
        );
        i += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(
          `<li>${renderInlineMarkdown(
            lines[i].trim().replace(/^\d+\.\s+/, "")
          )}</li>`
        );
        i += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    blocks.push(`<p>${renderInlineMarkdown(raw)}</p>`);
    i += 1;
  }

  return blocks.join("");
}

function MarkdownView({ text }) {
  return (
    <div
      className="notes-markdown-view"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text || "") }}
    />
  );
}

function ToolbarButton({ title, children, onClick, disabled }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="conference-secondary-btn"
      style={{
        minHeight: 36,
        padding: "0 12px",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

const secondaryInputStyle = {
  minHeight: 40,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.62)",
  color: "#e5eefc",
  padding: "0 14px",
  outline: "none",
  font: "inherit",
  boxSizing: "border-box",
};

export function NotesPage() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    originalText: "",
    translatedText: "",
  });

  const [activeEditor, setActiveEditor] = useState("original");

  const originalRef = useRef(null);
  const translatedRef = useRef(null);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) || null,
    [items, selectedId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((n) => {
      const hay = `${n.title || ""}\n${n.original_text || ""}\n${
        n.translated_text || ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    if (!isEditing) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isEditing]);

  const load = async () => {
    setUiError("");
    setUiSuccess("");

    try {
      setLoading(true);
      const data = await fetchNotes(token);
      setItems(data);

      if (data.length && selectedId == null) {
        setSelectedId(data[0].id);
      } else if (data.length && selectedId != null) {
        const stillExists = data.some((x) => x.id === selectedId);
        if (!stillExists) setSelectedId(data[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось загрузить конспекты");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartEdit = () => {
    if (!selected) return;
    setUiError("");
    setUiSuccess("");
    setDraft(createDraftFromNote(selected));
    setIsEditing(true);
    setActiveEditor("original");
  };

  const handleCancelEdit = () => {
    if (!selected) return;
    setDraft(createDraftFromNote(selected));
    setIsEditing(false);
    setUiError("");
    setUiSuccess("");
  };

  const handleSaveEdit = async () => {
    if (!selected) return;

    const payload = {
      title: (draft.title || "").trim() || "Конспект",
      original_text: draft.originalText || "",
      translated_text: draft.translatedText || "",
    };

    setUiError("");
    setUiSuccess("");

    try {
      setBusy(true);
      const updated = await updateNote(selected.id, payload, token);
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setIsEditing(false);
      setUiSuccess("Конспект сохранён");
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось сохранить конспект");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;

    setUiError("");
    setUiSuccess("");

    const ok = confirm(`Удалить конспект "${selected.title}"?`);
    if (!ok) return;

    try {
      setBusy(true);
      await deleteNote(selected.id, token);
      setItems((prev) => prev.filter((x) => x.id !== selected.id));
      setUiSuccess("Конспект удалён");
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (format) => {
    if (!selected) return;

    setUiError("");
    setUiSuccess("");

    try {
      setBusy(true);
      await downloadNoteExport(selected.id, format, token);
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось скачать");
    } finally {
      setBusy(false);
    }
  };

  const getActiveTextarea = () => {
    return activeEditor === "original" ? originalRef.current : translatedRef.current;
  };

  const setActiveValue = (nextValue, nextSelectionStart, nextSelectionEnd) => {
    if (activeEditor === "original") {
      setDraft((prev) => ({ ...prev, originalText: nextValue }));
    } else {
      setDraft((prev) => ({ ...prev, translatedText: nextValue }));
    }

    requestAnimationFrame(() => {
      const textarea = getActiveTextarea();
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  };

  const wrapSelection = (left, right = "") => {
    const textarea = getActiveTextarea();
    if (!textarea) return;

    const value = textarea.value;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selectedText = value.slice(start, end);
    const nextValue =
      value.slice(0, start) + left + selectedText + right + value.slice(end);

    setActiveValue(nextValue, start + left.length, end + left.length);
  };

  const prefixCurrentLine = (prefix) => {
    const textarea = getActiveTextarea();
    if (!textarea) return;

    const value = textarea.value;
    const start = textarea.selectionStart ?? 0;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);

    setActiveValue(nextValue, start + prefix.length, start + prefix.length);
  };

  const insertLink = () => {
    const textarea = getActiveTextarea();
    if (!textarea) return;

    const value = textarea.value;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selectedText = value.slice(start, end) || "текст ссылки";
    const insertion = `[${selectedText}](https://)`;
    const nextValue = value.slice(0, start) + insertion + value.slice(end);

    setActiveValue(nextValue, start + 1, start + 1 + selectedText.length);
  };

  const selectedPair = selected
    ? langPair(selected.original_language, selected.target_language)
    : null;

  return (
    <div className="page-inner">
      <h1 className="page-title">Конспекты</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <section className="conference-card" style={{ padding: 16 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по конспектам…"
              disabled={loading || busy}
              style={{
                ...secondaryInputStyle,
                flex: 1,
                minWidth: 0,
              }}
            />
            <button
              type="button"
              className="conference-secondary-btn"
              onClick={load}
              disabled={loading || busy}
              title="Обновить список"
            >
              ⟳
            </button>
          </div>

          <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: 12 }}>
            {loading ? "Загрузка…" : `${filtered.length} шт.`}
          </div>

          {filtered.length === 0 ? (
            <div style={{ color: "#9ca3af" }}>Пока нет сохранённых конспектов.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((n) => {
                const active = n.id === selectedId;
                const preview = clip(n.translated_text || n.original_text || "");
                const pair = langPair(n.original_language, n.target_language);

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (isEditing && n.id !== selectedId) return;
                      setSelectedId(n.id);
                    }}
                    style={{
                      textAlign: "left",
                      borderRadius: 16,
                      border: active
                        ? "1px solid rgba(122,162,255,0.65)"
                        : "1px solid rgba(148,163,184,0.18)",
                      background: active
                        ? "rgba(59,130,246,0.12)"
                        : "rgba(15,23,42,0.55)",
                      padding: 14,
                      cursor: isEditing && n.id !== selectedId ? "not-allowed" : "pointer",
                      opacity: isEditing && n.id !== selectedId ? 0.55 : 1,
                    }}
                    disabled={busy}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                      {n.title || "Конспект"}
                    </div>
                    {pair ? (
                      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
                        {pair}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 13, color: "#cbd5e1" }}>{preview}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="conference-card" style={{ padding: 18 }}>
          {!selected ? (
            <div style={{ color: "#9ca3af" }}>Выберите конспект слева</div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 380px" }}>
                  <h2 style={{ margin: 0 }}>{selected.title || "Конспект"}</h2>
                  {selectedPair ? (
                    <div style={{ color: "#9ca3af", marginTop: 6 }}>{selectedPair}</div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="conference-secondary-btn"
                    onClick={handleStartEdit}
                    disabled={busy}
                    title="Редактировать"
                  >
                    ✎
                  </button>

                  <button
                    type="button"
                    className="conference-secondary-btn"
                    onClick={() => handleExport("pdf")}
                    disabled={busy || isEditing}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    className="conference-secondary-btn"
                    onClick={() => handleExport("docx")}
                    disabled={busy || isEditing}
                  >
                    DOCX
                  </button>
                  <button
                    type="button"
                    className="conference-secondary-btn"
                    onClick={handleDelete}
                    disabled={busy || isEditing}
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                  gap: 18,
                  marginTop: 18,
                }}
              >
                <div className="notes-panel">
                  <div className="notes-panel-title">Оригинал</div>
                  <div className="notes-panel-subtitle">
                    {langHuman(selected.original_language) || "—"}
                  </div>
                  <div className="notes-panel-body">
                    <MarkdownView text={selected.original_text || ""} />
                  </div>
                </div>

                <div className="notes-panel">
                  <div className="notes-panel-title">Перевод</div>
                  <div className="notes-panel-subtitle">
                    {langHuman(selected.target_language) || "—"}
                  </div>
                  <div className="notes-panel-body">
                    <MarkdownView text={selected.translated_text || ""} />
                  </div>
                </div>
              </div>
            </>
          )}

          {uiError && (
            <div className="conference-message conference-message_error" style={{ marginTop: 14 }}>
              {uiError}
            </div>
          )}

          {uiSuccess && (
            <div
              className="conference-message conference-message_success"
              style={{ marginTop: 14 }}
            >
              {uiSuccess}
            </div>
          )}
        </section>
      </div>

      {isEditing && selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(2, 6, 23, 0.94)",
            backdropFilter: "blur(8px)",
            overflow: "auto",
          }}
        >
          <div
            style={{
              minHeight: "100vh",
              padding: "24px 24px 28px",
              display: "grid",
              gridTemplateRows: "auto auto 1fr",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 420px" }}>
                <div style={{ color: "#9ca3af", marginBottom: 8, fontSize: 14 }}>
                  Редактирование конспекта
                </div>
                <input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, title: e.target.value }))
                  }
                  disabled={busy}
                  placeholder="Название конспекта"
                  style={{
                    ...secondaryInputStyle,
                    width: "100%",
                    maxWidth: 680,
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="conference-secondary-btn"
                  onClick={handleSaveEdit}
                  disabled={busy}
                >
                  ✓ Сохранить
                </button>
                <button
                  type="button"
                  className="conference-secondary-btn"
                  onClick={handleCancelEdit}
                  disabled={busy}
                >
                  Отмена
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(148,163,184,0.18)",
                background: "rgba(15,23,42,0.6)",
              }}
            >
              <ToolbarButton
                title="Жирный"
                onClick={() => wrapSelection("**", "**")}
                disabled={busy}
              >
                **Жирный**
              </ToolbarButton>

              <ToolbarButton
                title="Курсив"
                onClick={() => wrapSelection("*", "*")}
                disabled={busy}
              >
                *Курсив*
              </ToolbarButton>

              <ToolbarButton
                title="Заголовок"
                onClick={() => prefixCurrentLine("# ")}
                disabled={busy}
              >
                H1 Заголовок
              </ToolbarButton>

              <ToolbarButton
                title="Подзаголовок"
                onClick={() => prefixCurrentLine("## ")}
                disabled={busy}
              >
                H2 Подзаголовок
              </ToolbarButton>

              <ToolbarButton
                title="Маркированный список"
                onClick={() => prefixCurrentLine("- ")}
                disabled={busy}
              >
                • Список
              </ToolbarButton>

              <ToolbarButton
                title="Нумерованный список"
                onClick={() => prefixCurrentLine("1. ")}
                disabled={busy}
              >
                1. Нум.
              </ToolbarButton>

              <ToolbarButton
                title="Цитата"
                onClick={() => prefixCurrentLine("> ")}
                disabled={busy}
              >
                ❝ Цитата
              </ToolbarButton>

              <ToolbarButton
                title="Код"
                onClick={() => wrapSelection("`", "`")}
                disabled={busy}
              >
                {"</> Код"}
              </ToolbarButton>

              <ToolbarButton
                title="Ссылка"
                onClick={insertLink}
                disabled={busy}
              >
                🔗 Ссылка
              </ToolbarButton>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: 18,
                minHeight: 0,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: "auto 1fr",
                  gap: 10,
                  minHeight: "calc(100vh - 210px)",
                }}
              >
                <div style={{ color: "#cbd5e1", fontWeight: 700 }}>
                  Оригинал {selected.original_language ? `• ${langHuman(selected.original_language)}` : ""}
                </div>

                <textarea
                  ref={originalRef}
                  value={draft.originalText}
                  onFocus={() => setActiveEditor("original")}
                  onClick={() => setActiveEditor("original")}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, originalText: e.target.value }))
                  }
                  placeholder="Оригинальный текст"
                  disabled={busy}
                  style={{
                    width: "100%",
                    minHeight: "100%",
                    height: "100%",
                    resize: "none",
                    borderRadius: 16,
                    border:
                      activeEditor === "original"
                        ? "1px solid rgba(96,165,250,0.65)"
                        : "1px solid rgba(148,163,184,0.18)",
                    background: "rgba(15,23,42,0.86)",
                    color: "#e5eefc",
                    padding: 16,
                    font: "inherit",
                    lineHeight: 1.6,
                    outline: "none",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateRows: "auto 1fr",
                  gap: 10,
                  minHeight: "calc(100vh - 210px)",
                }}
              >
                <div style={{ color: "#cbd5e1", fontWeight: 700 }}>
                  Перевод {selected.target_language ? `• ${langHuman(selected.target_language)}` : ""}
                </div>

                <textarea
                  ref={translatedRef}
                  value={draft.translatedText}
                  onFocus={() => setActiveEditor("translated")}
                  onClick={() => setActiveEditor("translated")}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, translatedText: e.target.value }))
                  }
                  placeholder="Переведённый текст"
                  disabled={busy}
                  style={{
                    width: "100%",
                    minHeight: "100%",
                    height: "100%",
                    resize: "none",
                    borderRadius: 16,
                    border:
                      activeEditor === "translated"
                        ? "1px solid rgba(96,165,250,0.65)"
                        : "1px solid rgba(148,163,184,0.18)",
                    background: "rgba(15,23,42,0.86)",
                    color: "#e5eefc",
                    padding: 16,
                    font: "inherit",
                    lineHeight: 1.6,
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {(uiError || uiSuccess) && (
              <div style={{ maxWidth: 720 }}>
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
