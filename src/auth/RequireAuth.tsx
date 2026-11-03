import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export const FullPageSpinner: React.FC = () => (
  <div className="min-h-screen bg-zinc-50 flex items-center justify-center" role="status" aria-label="Loading">
    <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

/** Sends signed-out visitors to /login and brings them back to the page they wanted afterwards. */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
};

/** Only lets internal paths through, so ?next= cannot send people to another site. */
export function safeNext(raw: string | null, fallback = '/app/dashboard'): string {
  if (!raw) return fallback;
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback;
}
