import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Birth from './pages/Birth';
import Embryo from './pages/Embryo';
import BeingDetail from './pages/BeingDetail';
import AdminSettings from './pages/AdminSettings';
import AdminQueue from './pages/AdminQueue';

function Protected({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/birth" element={<Protected><Birth /></Protected>} />
      <Route path="/embryo/:id" element={<Protected><Embryo /></Protected>} />
      <Route path="/being/:name" element={<Protected><BeingDetail /></Protected>} />
      <Route path="/admin/settings" element={<Protected><AdminSettings /></Protected>} />
      <Route path="/admin/queue" element={<Protected><AdminQueue /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
