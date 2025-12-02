import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export function LoginPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const url = isRegister
        ? `${API_URL}/api/auth/register`
        : `${API_URL}/api/auth/login`;

      const payload = isRegister
        ? {
            email,
            password,
            password_confirm: passwordConfirm,
            full_name: fullName || null,
          }
        : {
            email,
            password,
          };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        // если бэк вернул пустой ответ — оставим data = null
      }

      if (!res.ok) {
        // пробуем вытащить осмысленное сообщение
        const backendMsg =
          data?.detail ||
          data?.message ||
          (Array.isArray(data?.detail) ? data.detail[0]?.msg : null);

        setError(backendMsg || `Ошибка: ${res.status}`);
        return;
      }

      if (isRegister) {
        // успешная регистрация
        setSuccess("Вы зарегистрированы, теперь можете войти");
        setMode("login");
        setPassword("");
        setPasswordConfirm("");
        return;
      }

      // успешный логин
      // можно сохранить токен/юзера в localStorage или контекст
      if (data?.token) {
        localStorage.setItem("auth_token", data.token);
      }
      if (data?.user) {
        localStorage.setItem("auth_user", JSON.stringify(data.user));
      }

      navigate("/app/conferences");
    } catch (err) {
      console.error(err);
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }

  function switchToLogin() {
    setMode("login");
    setError("");
    setSuccess("");
  }

  function switchToRegister() {
    setMode("register");
    setError("");
    setSuccess("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="w-full max-w-md rounded-3xl bg-slate-900/80 border border-slate-700/70 shadow-2xl px-8 py-10 backdrop-blur-md">
        <h1 className="text-2xl font-semibold mb-2 text-white">
          {isRegister ? "Регистрация" : "Вход в систему"}
        </h1>
        <p className="text-sm text-slate-300 mb-8">
          {isRegister
            ? "Создайте профиль, чтобы управлять конференциями и конспектами."
            : "Авторизуйтесь, чтобы управлять конференциями и конспектами."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-slate-200">E-mail</label>
            <input
              type="email"
              className="w-full rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm mb-1 text-slate-200">
                Имя пользователя (необязательно)
              </label>
              <input
                type="text"
                className="w-full rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-sm mb-1 text-slate-200">Пароль</label>
            <input
              type="password"
              className="w-full rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm mb-1 text-slate-200">
                Повторите пароль
              </label>
              <input
                type="password"
                className="w-full rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 mt-1">
              {error}
            </p>
          )}

          {success && (
            <p className="text-sm text-emerald-400 mt-1">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 hover:from-indigo-400 hover:to-violet-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {loading
              ? isRegister
                ? "Регистрация..."
                : "Вход..."
              : isRegister
              ? "Зарегистрироваться"
              : "Войти"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-300">
          {isRegister ? (
            <>
              Уже есть аккаунт?{" "}
              <button
                type="button"
                onClick={switchToLogin}
                className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
              >
                Войти
              </button>
            </>
          ) : (
            <>
              Нет профиля?{" "}
              <button
                type="button"
                onClick={switchToRegister}
                className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
              >
                Зарегистрироваться
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
