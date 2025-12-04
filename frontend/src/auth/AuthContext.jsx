// frontend/src/auth/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const API_BASE = "http://localhost:8000/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // поднимаем состояние из localStorage (если уже логинились)
  useEffect(() => {
    const saved = localStorage.getItem("auth");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setUser(parsed.user || null);
      setToken(parsed.token || null);
    } catch {
      // если вдруг мусор — игнорируем
    }
  }, []);

  const saveAuth = (nextUser, nextToken) => {
    setUser(nextUser);
    setToken(nextToken);
    if (nextUser && nextToken) {
      localStorage.setItem(
        "auth",
        JSON.stringify({ user: nextUser, token: nextToken })
      );
    } else {
      localStorage.removeItem("auth");
    }
  };

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        (Array.isArray(data?.detail) && data.detail[0]?.msg) ||
        data?.detail ||
        "Не удалось войти";
      throw new Error(msg);
    }

    saveAuth(data.user, data.token);
  };

  const register = async (email, password, passwordConfirm, fullName) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        password_confirm: passwordConfirm,
        full_name: fullName,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        (Array.isArray(data?.detail) && data.detail[0]?.msg) ||
        data?.detail ||
        "Не удалось зарегистрироваться";
      throw new Error(msg);
    }
  };

  const logout = () => {
    saveAuth(null, null);
  };

  const value = { user, token, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used внутри AuthProvider");
  }
  return ctx;
}
