import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { FullPageSpinner } from './RequireAuth';
import { Button } from '../components/ui/Button';
import { Brand } from '../pages/auth/AuthLayout';
import { supabase } from '../lib/supabase';

/**
 * Inside /app: needs a workspace, and sends owners and managers of a new workspace to /onboarding first.
 * Staff and viewers who join an unfinished workspace go straight in.
 */
export const RequireWorkspace: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, workspace, workspaces, user, signOut } = useAuth();
  if (loading) return <FullPageSpinner />;

  if (workspaces.length === 0 || !workspace) {
    return <NoWorkspace email={user?.email} onSignOut={() => signOut()} />;
  }

  if (!workspace.onboarding_completed_at && ['owner', 'manager'].includes(workspace.role)) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
};

/** No workspace: a property owner with a login goes to their statements; anyone else is told what to do. */
const NoWorkspace: React.FC<{ email?: string | null; onSignOut: () => void }> = ({ email, onSignOut }) => {
  const [hasPortal, setHasPortal] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    supabase.rpc('my_owner_portals').then(({ data, error }) => setHasPortal(!error && Array.isArray(data) && data.length > 0));
  }, []);
  if (hasPortal === null) return <FullPageSpinner />;
  if (hasPortal) return <Navigate to="/owner" replace />;
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <Brand className="mb-10" />
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">No workspace yet</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {email} is not a member of any workspace. Ask your team owner to invite this address, or sign out and use another account.
        </p>
        <Button variant="outline" size="lg" className="mt-6" onClick={onSignOut}>Sign out</Button>
      </div>
    </div>
  );
};
