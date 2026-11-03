import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type MemberRole = 'owner' | 'manager' | 'staff' | 'viewer';
export type OrgStatus = 'trialing' | 'active' | 'past_due' | 'read_only' | 'cancelled';

export interface Workspace {
  id: string;
  name: string;
  status: OrgStatus;
  trial_ends_at: string | null;
  base_currency: string;
  country: string | null;
  timezone: string;
  onboarding_completed_at: string | null;
  role: MemberRole;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  selectWorkspace: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const CURRENT_KEY = 'staylytics.currentWorkspace';

function readStoredWorkspace(): string | null {
  try { return localStorage.getItem(CURRENT_KEY); } catch { return null; }
}
function storeWorkspace(id: string) {
  try { localStorage.setItem(CURRENT_KEY, id); } catch { /* private mode: ignore */ }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(readStoredWorkspace);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const refreshWorkspaces = useCallback(async () => {
    if (!userId) { setWorkspaces([]); return; }
    setWorkspacesLoading(true);
    const { data, error } = await supabase
      .from('memberships')
      .select('role, organizations(id, name, status, trial_ends_at, base_currency, country, timezone, onboarding_completed_at)')
      .eq('user_id', userId);
    setWorkspacesLoading(false);
    if (error) { console.error('Could not load workspaces', error); return; }
    const list = (data ?? [])
      .filter((m: any) => m.organizations)
      .map((m: any) => ({ ...m.organizations, role: m.role })) as Workspace[];
    list.sort((a, b) => a.name.localeCompare(b.name));
    setWorkspaces(list);
  }, [userId]);

  useEffect(() => { refreshWorkspaces(); }, [refreshWorkspaces]);

  const workspace = useMemo(
    () => workspaces.find(w => w.id === currentId) ?? workspaces[0] ?? null,
    [workspaces, currentId],
  );

  const value = useMemo<AuthState>(() => ({
    loading: sessionLoading || (Boolean(userId) && workspacesLoading && workspaces.length === 0),
    session,
    user: session?.user ?? null,
    workspaces,
    workspace,
    selectWorkspace: (id: string) => { setCurrentId(id); storeWorkspace(id); },
    refreshWorkspaces,
    signOut: async () => { await supabase.auth.signOut(); setWorkspaces([]); },
  }), [sessionLoading, userId, workspacesLoading, session, workspaces, workspace, refreshWorkspaces]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Whole days left in a trial, or null when the workspace is not trialing. */
export function trialDaysLeft(w: Workspace | null): number | null {
  if (!w || w.status !== 'trialing' || !w.trial_ends_at) return null;
  return Math.max(0, Math.ceil((Date.parse(w.trial_ends_at) - Date.now()) / 86_400_000));
}
