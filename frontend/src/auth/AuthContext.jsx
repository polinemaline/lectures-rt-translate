import React, { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

const AuthContext = createContext(null);
const AUTH_STORAGE_KEY = "auth";

function readAuthFromSession() {
  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw);
    return {
      user: parsed?.user || null,
      token: parsed?.token || null,
    };
  } catch {
    return { user: null, token: null };
  }
}

function writeAuthToSession(user, token) {
  try {
    if (user && token) {
      window.sessionStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ user, token })
      );
    } else {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const stored = readAuthFromSession();
    setUser(stored.user);
    setToken(stored.token);
  }, []);

  const saveAuth = (nextUser, nextToken) => {
    setUser(nextUser || null);
    setToken(nextToken || null);
    writeAuthToSession(nextUser || null, nextToken || null);
  };

  const login = async (email, password) => {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    saveAuth(data.user, data.token);
  };

  const register = async (email, password, passwordConfirm, fullName) => {
    await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        password_confirm: passwordConfirm,
        full_name: fullName,
      }),
    });
  };

  const logout = () => {
    saveAuth(null, null);
  };

  const value = {
    user,
    token,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used внутри AuthProvider");
  }

  return ctx;
}
