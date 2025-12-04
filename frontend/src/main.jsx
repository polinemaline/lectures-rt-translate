// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { AppLayout } from "./components/AppLayout";
import { ConferencesPage } from "./pages/ConferencesPage";
import { NotesPage } from "./pages/NotesPage";
import { UploadPage } from "./pages/UploadPage";

function Root() {
  const { user } = useAuth();

  // если не авторизован — всегда показываем LoginPage,
  // без роутов и без навигаций
  if (!user) {
    return <LoginPage />;
  }

  // авторизован — показываем основное приложение
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ConferencesPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/uploads" element={<UploadPage />} />
      </Routes>
    </AppLayout>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
