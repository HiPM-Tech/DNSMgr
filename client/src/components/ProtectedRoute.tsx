import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return null;
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

export function AdminRoute() {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
