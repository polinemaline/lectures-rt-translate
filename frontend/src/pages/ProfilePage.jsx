import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

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

const fieldStyle = {
  width: "100%",
  minHeight: 42,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.62)",
  color: "#e5eefc",
  padding: "0 14px",
  outline: "none",
  font: "inherit",
  boxSizing: "border-box",
};

function isValidEmail(value) {
  const v = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const storedName =
      localStorage.getItem("profile_display_name") ||
      user?.full_name ||
      user?.email?.split("@")[0] ||
      "";

    const storedAvatar = localStorage.getItem("profile_avatar");
    const storedEmail = localStorage.getItem("profile_email") || user?.email || "";

    setDisplayName(storedName);
    setProfileEmail(storedEmail);

    if (storedAvatar) {
      setAvatarPreview(storedAvatar);
    }
  }, [user]);

  const handleSave = (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = displayName.trim();
    const trimmedEmail = profileEmail.trim();

    if (!trimmedEmail) {
      setError("Введите e-mail");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError("Введите корректный e-mail");
      return;
    }

    localStorage.setItem("profile_display_name", trimmedName);
    localStorage.setItem("profile_email", trimmedEmail);

    setMessage("Профиль сохранён");
    setTimeout(() => setMessage(""), 2200);
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setAvatarPreview(dataUrl);
      localStorage.setItem("profile_avatar", dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const initial = useMemo(() => {
    const source =
      displayName?.trim() ||
      profileEmail?.trim() ||
      user?.email?.trim() ||
      "U";
    return source[0]?.toUpperCase() || "U";
  }, [displayName, profileEmail, user?.email]);

  if (!user) {
    return <div className="page-inner">Вы не авторизованы.</div>;
  }

  return (
    <div className="page-inner">
      <div
        className="conference-card"
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 8,
          }}
        >
          <button
            type="button"
            className="conference-secondary-btn"
            style={secondaryButtonStyle}
            onClick={() => navigate(-1)}
            title="Закрыть"
          >
            ×
          </button>
        </div>

        <h1 className="page-title" style={{ marginTop: 0 }}>
          Профиль пользователя
        </h1>

        <p style={{ color: "#9ca3af", marginTop: -6 }}>
          Здесь вы можете изменить отображаемое имя, e-mail и фото профиля.
        </p>

        <form
          onSubmit={handleSave}
          style={{
            display: "grid",
            gap: 18,
            marginTop: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 18,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                overflow: "hidden",
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(148,163,184,0.22)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>{initial}</span>
              )}
            </div>

            <label
              className="conference-secondary-btn"
              style={{ ...secondaryButtonStyle, cursor: "pointer" }}
            >
              Выбрать фото
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: "none" }}
              />
            </label>
          </div>

          <div>
            <div style={{ marginBottom: 8, color: "#cbd5e1" }}>E-mail</div>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              placeholder="example@mail.com"
              style={fieldStyle}
            />
          </div>

          <div>
            <div style={{ marginBottom: 8, color: "#cbd5e1" }}>
              Отображаемое имя
            </div>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Имя, которое будет видно в конференциях"
              style={fieldStyle}
            />
          </div>

          {error && (
            <div className="conference-message conference-message_error">
              {error}
            </div>
          )}

          {message && (
            <div className="conference-message conference-message_success">
              {message}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
