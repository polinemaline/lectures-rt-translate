import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const API_BASE = "http://localhost:8000/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // {id, email, full_name}
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed.user);
        setToken(parsed.token);
      } catch {
        // ignore
      }
    }
    setLoading(false);
  }, []);

  const login = async ({ email, password }) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Не удалось выполнить вход");
    }

    const data = await res.json();
    const authData = { user: data.user, token: data.token };
    localStorage.setItem("auth", JSON.stringify(authData));
    setUser(data.user);
    setToken(data.token);
  };

  const register = async ({ email, password, password_confirm }) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        password_confirm,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Не удалось зарегистрироваться");
    }
  };

  const logout = () => {
    localStorage.removeItem("auth");
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
