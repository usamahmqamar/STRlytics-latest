import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase, redirectTo } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { FullPageSpinner } from '../../auth/RequireAuth';
import { Button } from '../../components/ui/Button';
import { AuthLayout, Field, FormError, friendlyAuthError, passwordProblem, MIN_PASSWORD_LENGTH } from './AuthLayout';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo('/update-password') });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    setSent(true); // Same message whether or not the email exists, so accounts cannot be discovered.
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          <MailCheck size={22} className="text-emerald-600 mb-3" />
          If an account exists for <span className="font-medium text-zinc-900">{email.trim()}</span>, a reset link is on its way.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <FormError message={error} />
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
      <p className="mt-6 text-sm text-zinc-500"><Link to="/login" className="font-medium text-emerald-700 hover:underline">Back to log in</Link></p>
    </AuthLayout>
  );
};

/** Opened from the reset email: Supabase signs the person in for recovery, then they choose a new password. */
export const UpdatePasswordPage: React.FC = () => {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <FullPageSpinner />;
  if (!session) {
    return (
      <AuthLayout title="Link expired" subtitle="This reset link is no longer valid.">
        <Link to="/forgot-password" className="text-sm font-medium text-emerald-700 hover:underline">Request a new link</Link>
      </AuthLayout>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weak = passwordProblem(password);
    if (weak) { setError(weak); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    navigate('/app/dashboard', { replace: true });
  };

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={e => setPassword(e.target.value)} hint="At least 10 characters, with letters and numbers." />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy || !password || !confirm}>{busy ? 'Saving…' : 'Save password'}</Button>
      </form>
    </AuthLayout>
  );
};
