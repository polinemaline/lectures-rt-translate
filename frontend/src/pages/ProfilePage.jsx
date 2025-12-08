// frontend/src/pages/ProfilePage.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedName =
      localStorage.getItem("profile_display_name") ||
      user?.full_name ||
      user?.email?.split("@")[0] ||
      "";

    const storedAvatar = localStorage.getItem("profile_avatar");

    setDisplayName(storedName);
    if (storedAvatar) {
      setAvatarPreview(storedAvatar);
    }
  }, [user]);

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem("profile_display_name", displayName.trim());
    setMessage("Профиль сохранён");
    setTimeout(() => setMessage(""), 2000);
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

  if (!user) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p>Вы не авторизованы.</p>
        </div>
      </div>
    );
  }

  const initial =
    (displayName && displayName[0].toUpperCase()) ||
    (user.email && user.email[0].toUpperCase()) ||
    "U";

  return (
    <div className="profile-page">
      <div className="profile-card">
        {/* крестик закрытия */}
        <button
          type="button"
          className="profile-close"
          onClick={() => navigate(-1)}
        >
          ×
        </button>

        <h1 className="profile-title">Профиль пользователя</h1>
        <p className="profile-subtitle">
          Здесь вы можете изменить отображаемое имя и фото профиля.
        </p>

        <form onSubmit={handleSave} className="profile-form">
          <div className="profile-avatar-block">
            <div className="profile-avatar-preview">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Аватар" />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <label className="profile-avatar-label">
              <span className="profile-avatar-button">Выбрать фото</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="profile-avatar-input"
              />
            </label>
          </div>

          <div className="profile-field">
            <label className="profile-label">E-mail</label>
            <input
              type="email"
              className="profile-input"
              value={user.email}
              disabled
            />
          </div>

          <div className="profile-field">
            <label className="profile-label">Отображаемое имя</label>
            <input
              type="text"
              className="profile-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Имя, которое будет видно в конференциях"
            />
          </div>

          <button type="submit" className="profile-save-button">
            Сохранить
          </button>

          {message && <p className="profile-message">{message}</p>}
        </form>
      </div>
    </div>
  );
}
