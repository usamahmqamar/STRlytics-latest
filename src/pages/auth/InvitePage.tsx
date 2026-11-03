import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { FullPageSpinner } from '../../auth/RequireAuth';
import { AuthLayout } from './AuthLayout';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /invite/:token — the link in an invitation email.
 * Signed out: go to sign-up with the token. Signed in: accept it and open that workspace.
 * (Email sign-ups with a token join during sign-up; this page also covers Google sign-ups and existing users.)
 */
export const InvitePage: React.FC = () => {
  const { token = '' } = useParams();
  const { loading, session, refreshWorkspaces, selectWorkspace, workspaces } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !session || !UUID.test(token)) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
      if (cancelled) return;
      if (error) {
        // Already joined during email sign-up: the invitation is used up but the membership exists.
        await refreshWorkspaces();
        setError('This invitation has already been used, has expired, or was sent to a different email address.');
        return;
      }
      await refreshWorkspaces();
      selectWorkspace(data as string);
      navigate('/app/dashboard', { replace: true });
    })();
    return () => { cancelled = true; };
  }, [loading, session, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!UUID.test(token)) return <Navigate to="/login" replace />;
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to={`/signup?invite=${token}`} replace />;
  if (!error) return <FullPageSpinner />;

  return (
    <AuthLayout title="Invitation not available" subtitle={error}>
      <p className="text-sm text-zinc-500">
        Ask the person who invited you to send a new invitation{workspaces.length > 0 ? ', or ' : '.'}
        {workspaces.length > 0 && <Link to="/app/dashboard" className="font-medium text-emerald-700 hover:underline">open your workspace</Link>}
      </p>
    </AuthLayout>
  );
};
