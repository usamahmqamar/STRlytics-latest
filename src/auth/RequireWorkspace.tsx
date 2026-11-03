import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { FullPageSpinner } from './RequireAuth';
import { Button } from '../components/ui/Button';
import { Brand } from '../pages/auth/AuthLayout';

/**
 * Inside /app: needs a workspace, and sends owners and managers of a new workspace to /onboarding first.
 * Staff and viewers who join an unfinished workspace go straight in.
 */
export const RequireWorkspace: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, workspace, workspaces, user, signOut } = useAuth();
  if (loading) return <FullPageSpinner />;

  if (workspaces.length === 0 || !workspace) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-10">
        <div className="mx-auto max-w-md">
          <Brand className="mb-10" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">No workspace yet</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {user?.email} is not a member of any workspace. Ask your team owner to invite this address, or sign out and use another account.
          </p>
          <Button variant="outline" size="lg" className="mt-6" onClick={() => signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }

  if (!workspace.onboarding_completed_at && ['owner', 'manager'].includes(workspace.role)) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
};
