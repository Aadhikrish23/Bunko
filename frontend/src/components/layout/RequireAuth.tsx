import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';
import { PageSpinner } from '../ui/Spinner';

export function RequireAuth() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
