// frontend/src/pages/LoginPage.jsx
import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetMessages();

    try {
      if (mode === "login") {
        await login(email, password);
        // контекст обновится, Root-компонент сам покажет основное приложение
        return;
      }

      // режим регистрации
      if (password !== passwordConfirm) {
        setError("Пароли не совпадают");
        return;
      }

      await register(email, password, passwordConfirm, fullName || null);
      setSuccess("Вы зарегистрированы, теперь войдите");
      setMode("login");
      setPassword("");
      setPasswordConfirm("");
    } catch (err) {
      console.error("Auth error:", err);
      setError(err.message || "Ошибка авторизации");
    }
  };

  const switchToRegister = () => {
    resetMessages();
    setMode("register");
  };

  const switchToLogin = () => {
    resetMessages();
    setMode("login");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">
          {mode === "login" ? "Вход" : "Регистрация"}
        </h1>
        <p className="auth-subtitle">
          Авторизуйтесь, чтобы управлять конференциями и конспектами.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">E-mail</label>
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label">Имя</label>
              <input
                type="text"
                className="auth-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">Пароль</label>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {mode === "register" && (
            <div className="auth-field">
              <label className="auth-label">Повторите пароль</label>
              <input
                type="password"
                className="auth-input"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
              />
            </div>
          )}

          {error && <p className="auth-message auth-message_error">{error}</p>}
          {success && (
            <p className="auth-message auth-message_success">{success}</p>
          )}

          <button type="submit" className="auth-button">
            {mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-footer">
          {mode === "login" ? (
            <>
              Нет профиля?{" "}
              <button
                type="button"
                className="auth-link"
                onClick={switchToRegister}
              >
                Зарегистрироваться
              </button>
            </>
          ) : (
            <>
              Уже зарегистрированы?{" "}
              <button
                type="button"
                className="auth-link"
                onClick={switchToLogin}
              >
                Войти
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
