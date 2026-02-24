import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import CapabilitiesPage from './pages/CapabilitiesPage';
import AIFailureAnalysisPage from './pages/AIFailureAnalysisPage';
import AutonomousQaAgentPage from './pages/AutonomousQaAgentPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import PricingPage from './pages/PricingPage';
import PricingPlansPage from './pages/PricingPlansPage';
import PricingCalculatorPage from './pages/PricingCalculatorPage';
import PricingFaqPage from './pages/PricingFaqPage';
import ProfilePage from './pages/ProfilePage';
import RegisterPage from './pages/RegisterPage';
import RpaAgentPage from './pages/RpaAgentPage';
import RoadmapPage from './pages/RoadmapPage';
import ScriptEnginePage from './pages/ScriptEnginePage';
import SelfHealingPage from './pages/SelfHealingPage';

function RedirectIfAuthed({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="page-center">Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/self-healing" replace />;
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
      <Route path="/pricing/plans" element={<PricingPlansPage />} />
      <Route path="/pricing/calculator" element={<PricingCalculatorPage />} />
      <Route path="/pricing/faq" element={<PricingFaqPage />} />
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
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/script-engine"
        element={
          <ProtectedRoute>
            <ScriptEnginePage />
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
      <Route
        path="/autonomous-qa-agent"
        element={
          <ProtectedRoute>
            <AutonomousQaAgentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rpa-agent"
        element={
          <ProtectedRoute>
            <RpaAgentPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
