import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, CalendarCheck2, Wallet, Building2, AlertTriangle } from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { cn } from '../../lib/utils';

export const Brand: React.FC<{ className?: string }> = ({ className }) => (
  <Link to="/" className={cn('flex items-center gap-2.5', className)}>
    <span className="w-9 h-9 bg-zinc-950 rounded-xl flex items-center justify-center border border-zinc-800">
      <TrendingUp size={18} className="text-emerald-400" />
    </span>
    <span className="font-semibold text-lg tracking-tight text-zinc-900">Staylytics</span>
  </Link>
);

const points = [
  { icon: Wallet, text: 'Daily profit for every listing, after rent, fees and costs' },
  { icon: CalendarCheck2, text: 'Rent cheques, bills and payouts on one timeline' },
  { icon: Building2, text: 'Rent-to-rent and managed units in one portfolio' },
];

export const AuthLayout: React.FC<{ title: string; subtitle?: React.ReactNode; children: React.ReactNode }> = ({
  title, subtitle, children,
}) => (
  <div className="min-h-screen bg-zinc-50 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <aside className="hidden lg:flex flex-col justify-between bg-zinc-950 text-zinc-100 p-12">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 bg-zinc-900 rounded-xl flex items-center justify-center border border-zinc-800">
          <TrendingUp size={18} className="text-emerald-400" />
        </span>
        <span className="font-semibold text-lg tracking-tight">Staylytics</span>
      </div>
      <div className="max-w-sm">
        <p className="text-2xl font-semibold leading-snug tracking-tight">
          Know what each listing really earns, every day.
        </p>
        <ul className="mt-8 space-y-4">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 text-sm text-zinc-300">
              <Icon size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-zinc-500">15-day free trial · no card required</p>
    </aside>

    <main className="flex items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-sm">
        <Brand className="lg:hidden mb-10" />
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>}
        {!isSupabaseConfigured && (
          <p className="mt-6 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle size={16} className="shrink-0" />
            Sign-in is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
          </p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  </div>
);

export const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }> = ({
  label, hint, id, className, ...props
}) => {
  const inputId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-xs font-medium text-zinc-700">{label}</label>
      <input
        id={inputId}
        className={cn(
          'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500',
          className,
        )}
        {...props}
      />
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
};

export const FormError: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">{message}</p>
  ) : null;

export const GoogleButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
  >
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
    Continue with Google
  </button>
);

export const Divider: React.FC = () => (
  <div className="flex items-center gap-3 my-6 text-[11px] text-zinc-400">
    <span className="h-px flex-1 bg-zinc-200" /> or <span className="h-px flex-1 bg-zinc-200" />
  </div>
);

/** Turns Supabase auth errors into plain sentences. */
export const MIN_PASSWORD_LENGTH = 10;

/** Client-side password rule; mirror it in Supabase → Authentication → Providers → Email. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'Use both letters and numbers in your password.';
  return null;
}

export function friendlyAuthError(message: string | undefined): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
  if (m.includes('password should be') || m.includes('weak password') || m.includes('pwned') || m.includes('leaked')) return 'Choose a stronger password: at least 10 characters, mixing letters and numbers, and not one used on other sites.';
  // Same wording as a fresh sign-up, so the form cannot be used to discover who has an account.
  if (m.includes('already registered') || m.includes('already exists')) return 'If this email can be used, we have sent a confirmation link. Check your inbox, or log in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the sign-in service. Check your connection and try again.';
  if (m.includes('provider is not enabled')) return 'Google sign-in is not switched on yet. Use email and password for now.';
  if (m.includes('same password')) return 'The new password must be different from the old one.';
  return message || 'Something went wrong. Please try again.';
}
