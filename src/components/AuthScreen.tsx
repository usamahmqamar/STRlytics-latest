import React, { useState } from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { supabase, supabaseConfigured } from '../services/supabase';
import { Button } from './ui/Button';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

const MIN_PASSWORD = 10;

// One message for wrong email or wrong password, so the form never reveals which accounts exist.
const GENERIC_SIGNIN_ERROR = 'Email or password is incorrect, or the email is not confirmed yet.';

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[a-z]/i.test(pw) || !/[0-9]/.test(pw)) return 'Use letters and at least one number.';
  return null;
}

export const AuthScreen: React.FC<{ initialMode?: Mode; onPasswordReset?: () => void }> = ({ initialMode = 'signin', onPasswordReset }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const redirectTo = window.location.origin;
  const go = (m: Mode) => { setMode(m); setError(null); setNotice(null); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); } finally { setBusy(false); }
  };

  const google = () => run(async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) setError('Google sign-in is not available right now. Please try email instead.');
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const cleanEmail = email.trim().toLowerCase();
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) setError(error.status === 429 ? 'Too many attempts. Please wait a few minutes.' : GENERIC_SIGNIN_ERROR);
      } else if (mode === 'signup') {
        const problem = passwordProblem(password);
        if (problem) return setError(problem);
        const { error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: { full_name: fullName.trim().slice(0, 120), company_name: company.trim().slice(0, 120) },
          },
        });
        if (error && error.status === 429) return setError('Too many attempts. Please wait a few minutes.');
        if (error && /password/i.test(error.message)) return setError('That password is too weak or has appeared in a data breach. Please choose another.');
        // Same message whether or not the email already has an account (no account enumeration).
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signin');
      } else if (mode === 'forgot') {
        await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
        setNotice('If an account exists for that email, a reset link is on its way.');
      } else if (mode === 'reset') {
        const problem = passwordProblem(password);
        if (problem) return setError(problem);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return setError('Could not update the password. Please request a new reset link.');
        setNotice('Password updated.');
        onPasswordReset?.();
      }
    });
  };

  const title = { signin: 'Sign in to Staylytics', signup: 'Create your workspace', forgot: 'Reset your password', reset: 'Choose a new password' }[mode];
  const input = 'w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:border-emerald-500';

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl shadow-sm p-8">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <TrendingUp className="text-emerald-600" size={24} />
        </div>
        <h1 className="text-xl font-bold text-zinc-900 text-center">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500 text-center">Your portfolio data is private to your workspace.</p>

        {!supabaseConfigured && <p className="mt-4 text-xs text-rose-600 text-center">Sign-in is unavailable. Please try again later.</p>}

        {(mode === 'signin' || mode === 'signup') && (
          <>
            <Button className="mt-6 w-full" variant="outline" onClick={google} disabled={busy || !supabaseConfigured}>
              Continue with Google
            </Button>
            <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-widest text-zinc-400">
              <div className="h-px flex-1 bg-zinc-200" /> or <div className="h-px flex-1 bg-zinc-200" />
            </div>
          </>
        )}

        <form onSubmit={submit} className={mode === 'forgot' || mode === 'reset' ? 'mt-6 space-y-3' : 'space-y-3'}>
          {mode === 'signup' && (
            <>
              <input className={input} placeholder="Your name" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} autoComplete="name" required />
              <input className={input} placeholder="Company or workspace name" value={company} onChange={e => setCompany(e.target.value)} maxLength={120} />
            </>
          )}
          {mode !== 'reset' && (
            <input className={input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="email" required />
          )}
          {mode !== 'forgot' && (
            <input className={input} type="password" placeholder={mode === 'signin' ? 'Password' : `New password (min ${MIN_PASSWORD} characters)`}
              value={password} onChange={e => setPassword(e.target.value)} maxLength={128}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {notice && <p className="text-xs text-emerald-700">{notice}</p>}
          <Button type="submit" className="w-full" disabled={busy || !supabaseConfigured}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {{ signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save password' }[mode]}
          </Button>
        </form>

        <div className="mt-5 text-center text-xs text-zinc-500 space-y-2">
          {mode === 'signin' && (
            <>
              <button className="hover:text-zinc-900" onClick={() => go('forgot')}>Forgot password?</button>
              <p>New here? <button className="font-semibold text-emerald-700" onClick={() => go('signup')}>Create a workspace</button></p>
            </>
          )}
          {(mode === 'signup' || mode === 'forgot') && (
            <button className="font-semibold text-emerald-700" onClick={() => go('signin')}>Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
};
