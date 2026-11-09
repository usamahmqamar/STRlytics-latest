import { createClient } from '@supabase/supabase-js';

// import.meta.env is set by Vite; it is absent when the module is loaded in Node tests.
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);

// The publishable key is safe in the browser: row-level security decides what each user can read or write.
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

/** Where Supabase should send people back after email confirmation, OAuth or password reset. */
export const redirectTo = (path: string) => `${window.location.origin}${path}`;
