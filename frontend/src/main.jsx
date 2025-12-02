import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { AppLayout } from "./components/AppLayout";
import { ConferencesPage } from "./pages/ConferencesPage";
import { NotesPage } from "./pages/NotesPage";
import { UploadPage } from "./pages/UploadPage";
import { ProfilePage } from "./pages/ProfilePage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // можно сделать спиннер
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="conferences" element={<ConferencesPage />} />
                <Route path="notes" element={<NotesPage />} />
                <Route path="upload" element={<UploadPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route
                  path="*"
                  element={<Navigate to="/app/conferences" replace />}
                />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
