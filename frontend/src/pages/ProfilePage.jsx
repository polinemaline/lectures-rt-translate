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
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 400,
  lineHeight: 1.35,
  letterSpacing: "0.01em",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
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

const fieldLabelStyle = {
  marginBottom: 8,
  color: "#cbd5e1",
};

const passwordEntryStyle = {
  width: "100%",
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.52)",
  color: "#e5eefc",
  padding: "16px 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 400,
  lineHeight: 1.35,
  letterSpacing: "0.01em",
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 1000,
};

const modalCardStyle = {
  width: "100%",
  maxWidth: 560,
  borderRadius: 24,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(15,23,42,0.94))",
  boxShadow: "0 24px 80px rgba(2, 6, 23, 0.55)",
  padding: 22,
};

function isValidEmail(value) {
  const v = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function ArrowRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 6L15 12L9 18"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfilePage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(null);

  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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

  useEffect(() => {
    if (!isPasswordModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleClosePasswordModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPasswordModalOpen]);

  const clearProfileFeedbackLater = () => {
    window.setTimeout(() => {
      setProfileMessage("");
      setProfileError("");
    }, 2200);
  };

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setPasswordMessage("");
    setPasswordError("");
    setIsChangingPassword(false);
  };

  const handleOpenPasswordModal = () => {
    resetPasswordForm();
    setIsPasswordModalOpen(true);
  };

  const handleClosePasswordModal = () => {
    resetPasswordForm();
    setIsPasswordModalOpen(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileMessage("");

    const trimmedName = displayName.trim();
    const trimmedEmail = profileEmail.trim();

    if (!trimmedEmail) {
      setProfileError("Введите e-mail");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setProfileError("Введите корректный e-mail");
      return;
    }

    localStorage.setItem("profile_display_name", trimmedName);
    localStorage.setItem("profile_email", trimmedEmail);

    setProfileMessage("Профиль сохранён");
    clearProfileFeedbackLater();
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

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      setPasswordError("Заполните все поля для смены пароля");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Новый пароль должен содержать минимум 6 символов");
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordError("Новые пароли не совпадают");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("Новый пароль должен отличаться от текущего");
      return;
    }

    try {
      setIsChangingPassword(true);

      const response = await changePassword(
        currentPassword,
        newPassword,
        newPasswordConfirm
      );

      setPasswordMessage(response?.message || "Пароль успешно изменён");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");

      window.setTimeout(() => {
        handleClosePasswordModal();
      }, 1200);
    } catch (err) {
      setPasswordError(err.message || "Не удалось изменить пароль");
    } finally {
      setIsChangingPassword(false);
    }
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
            <div style={fieldLabelStyle}>E-mail</div>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              placeholder="example@mail.com"
              style={fieldStyle}
            />
          </div>

          <div>
            <div style={fieldLabelStyle}>Отображаемое имя</div>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Имя, которое будет видно в конференциях"
              style={fieldStyle}
            />
          </div>

          <div>
            <div style={fieldLabelStyle}>Пароль</div>
            <button
              type="button"
              onClick={handleOpenPasswordModal}
              style={passwordEntryStyle}
            >
              <div style={{ display: "grid", gap: 4, textAlign: "left" }}>
                <span style={fieldLabelStyle}>Смена пароля</span>
              </div>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#cbd5e1",
                }}
              >
                <ArrowRightIcon />
              </span>
            </button>
          </div>

          {profileError && (
            <div className="conference-message conference-message_error">
              {profileError}
            </div>
          )}

          {profileMessage && (
            <div className="conference-message conference-message_success">
              {profileMessage}
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

      {isPasswordModalOpen && (
        <div
          style={modalOverlayStyle}
          onClick={handleClosePasswordModal}
        >
          <div
            className="conference-card"
            style={modalCardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 24, color: "#e5eefc" }}>
                  Смена пароля
                </h2>
              </div>

              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={handleClosePasswordModal}
                title="Закрыть"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handlePasswordChange}
              style={{
                display: "grid",
                gap: 18,
                marginTop: 18,
              }}
            >
              <div>
                <div style={fieldLabelStyle}>Текущий пароль</div>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Введите текущий пароль"
                  style={fieldStyle}
                />
              </div>

              <div>
                <div style={fieldLabelStyle}>Новый пароль</div>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  style={fieldStyle}
                />
              </div>

              <div>
                <div style={fieldLabelStyle}>Повторите новый пароль</div>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="Повторите новый пароль"
                  style={fieldStyle}
                />
              </div>

              {passwordError && (
                <div className="conference-message conference-message_error">
                  {passwordError}
                </div>
              )}

              {passwordMessage && (
                <div className="conference-message conference-message_success">
                  {passwordMessage}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="submit"
                  className="conference-secondary-btn"
                  style={secondaryButtonStyle}
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? "Сохраняем..." : "Изменить пароль"}
                </button>

                <button
                  type="button"
                  className="conference-secondary-btn"
                  style={secondaryButtonStyle}
                  onClick={handleClosePasswordModal}
                  disabled={isChangingPassword}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
