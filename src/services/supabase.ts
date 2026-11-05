/**
 * Browser Supabase client.
 * Uses only the publishable key, which is safe to ship: every table is protected by
 * row-level security, so the key grants nothing without a signed-in user's permissions.
 */
import { createClient } from '@supabase/supabase-js';

const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && publishableKey);

export const supabase = createClient(url || 'http://localhost', publishableKey || 'missing', {
  auth: {
    flowType: 'pkce', // OAuth and email links use PKCE codes, not tokens in the URL
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type MemberRole = 'owner' | 'manager' | 'staff' | 'viewer';
export type OrgStatus = 'trialing' | 'active' | 'past_due' | 'read_only' | 'cancelled';

export interface Workspace {
  id: string;
  name: string;
  role: MemberRole;
  status: OrgStatus;
  trialEndsAt: string | null;
}

/** Mirrors private.org_is_writable() so the UI can explain read-only mode; the database enforces it. */
export function workspaceIsWritable(ws: Workspace): boolean {
  if (ws.status === 'active' || ws.status === 'past_due') return true;
  if (ws.status !== 'trialing') return false;
  if (!ws.trialEndsAt) return true;
  return new Date(ws.trialEndsAt).getTime() + 5 * 24 * 3600 * 1000 > Date.now();
}

export const canEdit = (ws: Workspace) => ws.role !== 'viewer' && workspaceIsWritable(ws);
export const canManage = (ws: Workspace) => (ws.role === 'owner' || ws.role === 'manager') && workspaceIsWritable(ws);
