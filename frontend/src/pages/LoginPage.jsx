import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";

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

export function LoginPage() {
  const { login, register } = useAuth();

  const [mode, setMode] = useState("login");
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
        return;
      }

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
    <div className="page-inner">
      <div
        className="conference-card"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: 24,
        }}
      >
        <h1 className="page-title" style={{ marginTop: 0 }}>
          {mode === "login" ? "Вход" : "Регистрация"}
        </h1>

        <p style={{ color: "#9ca3af", marginTop: -6, marginBottom: 18 }}>
          Авторизуйтесь, чтобы управлять конференциями и конспектами.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ marginBottom: 8, color: "#cbd5e1" }}>E-mail</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={fieldStyle}
            />
          </div>

          {mode === "register" && (
            <div>
              <div style={{ marginBottom: 8, color: "#cbd5e1" }}>Имя</div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={fieldStyle}
              />
            </div>
          )}

          <div>
            <div style={{ marginBottom: 8, color: "#cbd5e1" }}>Пароль</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={fieldStyle}
            />
          </div>

          {mode === "register" && (
            <div>
              <div style={{ marginBottom: 8, color: "#cbd5e1" }}>
                Повторите пароль
              </div>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                style={fieldStyle}
              />
            </div>
          )}

          {error && (
            <div className="conference-message conference-message_error">
              {error}
            </div>
          )}

          {success && (
            <div className="conference-message conference-message_success">
              {success}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <button
              type="submit"
              className="conference-secondary-btn"
              style={secondaryButtonStyle}
            >
              {mode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>

            {mode === "login" ? (
              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={switchToRegister}
              >
                Зарегистрироваться
              </button>
            ) : (
              <button
                type="button"
                className="conference-secondary-btn"
                style={secondaryButtonStyle}
                onClick={switchToLogin}
              >
                Войти
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
