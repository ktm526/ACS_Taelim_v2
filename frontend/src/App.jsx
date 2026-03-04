import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import MainLayout from '@/layouts/MainLayout';
import DashboardPage from '@/pages/DashboardPage';
import MapManagementPage from '@/pages/MapManagementPage';
import SettingsPage from '@/pages/SettingsPage';
import LogPage from '@/pages/LogPage';

function ProtectedRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="maps" element={<AdminRoute><MapManagementPage /></AdminRoute>} />
        <Route path="logs" element={<AdminRoute><LogPage /></AdminRoute>} />
        <Route path="settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
