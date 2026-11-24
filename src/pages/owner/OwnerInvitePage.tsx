/**
 * /owner-invite/:token — an invitation for a property owner to see their statements.
 * Signed out: go to sign-up (or log in) with the token. Signed in: accept it and open the portal.
 */
import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { FullPageSpinner } from '../../auth/RequireAuth';
import { AuthLayout } from '../auth/AuthLayout';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OwnerInvitePage: React.FC = () => {
  const { token = '' } = useParams();
  const { loading, session, user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !session || !UUID.test(token)) return;
    let cancelled = false;
    supabase.rpc('accept_owner_invitation', { p_token: token }).then(({ error }) => {
      if (cancelled) return;
      if (error) {
        setError(`This invitation has expired, or it was sent to a different email address than ${user?.email ?? 'yours'}.`);
        return;
      }
      navigate('/owner', { replace: true });
    });
    return () => { cancelled = true; };
  }, [loading, session, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!UUID.test(token)) return <Navigate to="/login" replace />;
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to={`/signup?owner_invite=${token}`} replace />;
  if (!error) return <FullPageSpinner />;
  return (
    <AuthLayout title="Invitation not available" subtitle={error}>
      <p className="text-sm text-zinc-500">
        Ask the company that manages your property to send a new invitation, or <Link to="/owner" className="font-medium text-emerald-700 hover:underline">open your statements</Link> if you already have access.
      </p>
    </AuthLayout>
  );
};
