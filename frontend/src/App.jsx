import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import CapabilitiesPage from './pages/CapabilitiesPage';
import DashboardPage from './pages/DashboardPage';
import AIFailureAnalysisPage from './pages/AIFailureAnalysisPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import PricingPage from './pages/PricingPage';
import RegisterPage from './pages/RegisterPage';
import RoadmapPage from './pages/RoadmapPage';
import SelfHealingPage from './pages/SelfHealingPage';

function RedirectIfAuthed({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="page-center">Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/capabilities" element={<CapabilitiesPage />} />
      <Route path="/roadmap" element={<RoadmapPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <RegisterPage />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/script-engine"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/self-healing"
        element={
          <ProtectedRoute>
            <SelfHealingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-failure-analysis"
        element={
          <ProtectedRoute>
            <AIFailureAnalysisPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
