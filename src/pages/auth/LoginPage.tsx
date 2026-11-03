import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, redirectTo } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { safeNext } from '../../auth/RequireAuth';
import { Button } from '../../components/ui/Button';
import { AuthLayout, Divider, Field, FormError, GoogleButton, friendlyAuthError } from './AuthLayout';

export const LoginPage: React.FC = () => {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  if (session) return <Navigate to={next} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setUnconfirmed(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(friendlyAuthError(error.message));
      setUnconfirmed(error.message.toLowerCase().includes('not confirmed'));
      return;
    }
    navigate(next, { replace: true });
  };

  const resend = async () => {
    await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo(next) } });
    setResent(true);
  };

  const google = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo(next) } });
    if (error) setError(friendlyAuthError(error.message));
  };

  return (
    <AuthLayout title="Log in" subtitle={<>New to Staylytics? <Link to="/signup" className="font-medium text-emerald-700 hover:underline">Start a free trial</Link></>}>
      <GoogleButton onClick={google} disabled={busy} />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <div className="space-y-1.5">
          <Field label="Password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          <div className="text-right">
            <Link to="/forgot-password" className="text-[11px] text-zinc-500 hover:text-zinc-900">Forgot password?</Link>
          </div>
        </div>
        <FormError message={error} />
        {unconfirmed && (
          <button type="button" onClick={resend} disabled={resent} className="text-xs font-medium text-emerald-700 hover:underline disabled:text-zinc-400 disabled:no-underline">
            {resent ? 'Confirmation email sent again' : 'Send the confirmation email again'}
          </button>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy || !email || !password}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  );
};
