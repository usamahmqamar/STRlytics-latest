import React, { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase, redirectTo } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { AuthLayout, Divider, Field, FormError, GoogleButton, friendlyAuthError, passwordProblem, MIN_PASSWORD_LENGTH } from './AuthLayout';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SignupPage: React.FC = () => {
  const [params] = useSearchParams();
  const inviteToken = UUID.test(params.get('invite') ?? '') ? params.get('invite')! : null;
  const { session } = useAuth();
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Email sign-ups with a token join the workspace during sign-up, so the confirmation link opens the app.
  // Google sign-ups cannot carry the token, so they come back through the invitation page to join.
  const landing = inviteToken ? `/invite/${inviteToken}` : '/app/dashboard';
  const emailLanding = '/app/dashboard';
  if (session) return <Navigate to={landing} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weak = passwordProblem(password);
    if (weak) { setError(weak); return; }
    setBusy(true); setError(null);
    const metadata: Record<string, string> = { full_name: fullName.trim() };
    if (inviteToken) metadata.invite_token = inviteToken;
    else metadata.company_name = company.trim();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: metadata, emailRedirectTo: redirectTo(emailLanding) },
    });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    // With email confirmation on, there is no session until the link is clicked.
    if (!data.session) setSentTo(email.trim());
  };

  const google = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo(landing) } });
    if (error) setError(friendlyAuthError(error.message));
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          <MailCheck size={22} className="text-emerald-600 mb-3" />
          We sent a confirmation link to <span className="font-medium text-zinc-900">{sentTo}</span>.
          Open it to {inviteToken ? 'join your team' : 'start your 15-day trial'}.
          <p className="mt-3 text-xs text-zinc-400">No email after a few minutes? Check spam, or <button type="button" className="font-medium text-emerald-700 hover:underline" onClick={() => supabase.auth.resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: redirectTo(emailLanding) } })}>send it again</button>.</p>
        </div>
        <p className="mt-6 text-sm text-zinc-500"><Link to="/login" className="font-medium text-emerald-700 hover:underline">Back to log in</Link></p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={inviteToken ? 'Join your team' : 'Start your free trial'}
      subtitle={<>{inviteToken ? 'Create your account to accept the invitation.' : '15 days free, no card required.'} Already have an account? <Link to={inviteToken ? `/login?next=/invite/${inviteToken}` : '/login'} className="font-medium text-emerald-700 hover:underline">Log in</Link></>}
    >
      <GoogleButton onClick={google} disabled={busy} />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Your name" name="full_name" autoComplete="name" required maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} />
        {!inviteToken && (
          <Field label="Company name" name="company" autoComplete="organization" maxLength={120} value={company} onChange={e => setCompany(e.target.value)} hint="Your workspace name. You can change it later." />
        )}
        <Field label="Work email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} value={password} onChange={e => setPassword(e.target.value)} hint="At least 10 characters, with letters and numbers." />
        <FormError message={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy || !fullName.trim() || !email || !password}>
          {busy ? 'Creating account…' : inviteToken ? 'Create account and join' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
};
