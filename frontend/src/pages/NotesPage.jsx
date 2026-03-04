// frontend/src/pages/NotesPage.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { deleteNote, downloadNoteExport, fetchNotes, updateNote } from "../services/notesService";

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

export function NotesPage() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [uiError, setUiError] = useState("");
  const [uiSuccess, setUiSuccess] = useState("");

  const [titleDraft, setTitleDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((n) => {
      const hay = `${n.title || ""}\n${n.original_text || ""}\n${n.translated_text || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const load = async () => {
    setUiError("");
    setUiSuccess("");
    try {
      setLoading(true);
      const data = await fetchNotes(token);
      setItems(data);

      if (data.length && selectedId == null) setSelectedId(data[0].id);
      else if (data.length && selectedId != null) {
        const stillExists = data.some((x) => x.id === selectedId);
        if (!stillExists) setSelectedId(data[0].id);
      } else setSelectedId(null);
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

  useEffect(() => {
    setTitleDraft(selected?.title || "");
  }, [selected]);

  const handleSaveTitle = async () => {
    if (!selected) return;
    if ((titleDraft || "").trim() === (selected.title || "").trim()) return;

    setUiError("");
    setUiSuccess("");
    try {
      setBusy(true);
      const updated = await updateNote(selected.id, { title: titleDraft }, token);
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setUiSuccess("Название сохранено");
    } catch (e) {
      console.error(e);
      setUiError(e.message || "Не удалось сохранить");
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

  return (
    <div className="page-inner" style={{ maxWidth: 1200 }}>
      <h1 className="page-title">Конспекты</h1>

      <div className="notes-page">
        <div className="notes-list">
          <div className="notes-list-head">
            <div className="notes-search">
              <input
                className="notes-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по конспектам…"
                disabled={loading || busy}
              />
              <button className="notes-refresh" onClick={load} disabled={loading || busy} title="Обновить">
                ⟳
              </button>
            </div>
            <div className="notes-count">{loading ? "Загрузка…" : `${filtered.length} шт.`}</div>
          </div>

          <div className="notes-list-body">
            {filtered.length === 0 ? (
              <div className="notes-empty">Пока нет сохранённых конспектов.</div>
            ) : (
              filtered.map((n) => {
                const active = n.id === selectedId;
                const preview = clip(n.translated_text || n.original_text || "");
                const pair = langPair(n.original_language, n.target_language);

                return (
                  <button
                    key={n.id}
                    className={"notes-item" + (active ? " notes-item_active" : "")}
                    onClick={() => setSelectedId(n.id)}
                  >
                    <div className="notes-item-title">{n.title || "Конспект"}</div>
                    {pair ? <div className="notes-item-meta">{pair}</div> : null}
                    <div className="notes-item-preview">{preview}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="notes-view">
          {!selected ? (
            <div className="notes-view-empty">Выберите конспект слева</div>
          ) : (
            <>
              <div className="notes-view-head">
                <div className="notes-title-row">
                  {/* КНОПКУ "СОХРАНИТЬ" УБРАЛИ: авто-сохранение по blur/Enter */}
                  <input
                    className="notes-title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    disabled={busy}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveTitle();
                      }
                    }}
                  />
                </div>

                <div className="notes-actions">
                  <button className="conference-secondary-btn" onClick={() => handleExport("pdf")} disabled={busy}>
                    PDF
                  </button>
                  <button className="conference-secondary-btn" onClick={() => handleExport("docx")} disabled={busy}>
                    DOCX
                  </button>
                  <button className="conference-secondary-btn" onClick={handleDelete} disabled={busy}>
                    Удалить
                  </button>
                </div>
              </div>

              <div className="notes-shell" style={{ marginTop: 14 }}>
                <div className="notes-panel">
                  <div className="notes-panel-title">Оригинал</div>
                  <div className="notes-panel-subtitle">{langHuman(selected.original_language) || "—"}</div>
                  <div className="notes-panel-body">
                    {(selected.original_text || "").split("\n").map((line, i) => (
                      <div className="notes-line" key={i}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="notes-panel">
                  <div className="notes-panel-title">Перевод</div>
                  <div className="notes-panel-subtitle">{langHuman(selected.target_language) || "—"}</div>
                  <div className="notes-panel-body">
                    {(selected.translated_text || "").split("\n").map((line, i) => (
                      <div className="notes-line" key={i}>
                        {line}
                      </div>
                    ))}
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
            <div className="conference-message conference-message_success" style={{ marginTop: 14 }}>
              {uiSuccess}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
