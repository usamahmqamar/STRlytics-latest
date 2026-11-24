/**
 * What the signed-in user may change in a workspace, for the interface only.
 * The database enforces the same rules (row-level security and private.org_is_writable);
 * these helpers exist so the app can explain read-only mode instead of failing silently.
 */
import type { Workspace } from '../auth/AuthProvider';

const GRACE_MS = 5 * 24 * 3600 * 1000; // matches the 5-day grace in private.org_is_writable()

export function workspaceIsWritable(ws: Workspace): boolean {
  if (ws.deletion_requested_at) return false;
  if (ws.status === 'active' || ws.status === 'past_due') return true;
  if (ws.status !== 'trialing') return false;
  if (!ws.trial_ends_at) return true;
  return Date.parse(ws.trial_ends_at) + GRACE_MS > Date.now();
}

/** Staff and above can edit day-to-day records. */
export const canEdit = (ws: Workspace) => ws.role !== 'viewer' && workspaceIsWritable(ws);
/** Owners and managers can edit properties, finance and workspace settings. */
export const canManage = (ws: Workspace) => (ws.role === 'owner' || ws.role === 'manager') && workspaceIsWritable(ws);
