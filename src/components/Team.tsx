import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, UserPlus, Trash2, LogOut } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth, type MemberRole } from '../auth/AuthProvider';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';

interface Member {
  membership_id: string; user_id: string; full_name: string | null; email: string;
  role: MemberRole; joined_at: string; is_me: boolean;
}
interface Invitation { id: string; email: string; role: MemberRole; token: string; expires_at: string }

const ROLE_INFO: Record<MemberRole, string> = {
  owner: 'Everything, including billing and the team',
  manager: 'Everything except billing; can invite staff and viewers',
  staff: 'Day-to-day operations, without finance',
  viewer: 'Read-only, e.g. a property owner or investor',
};
const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', manager: 'Manager', staff: 'Staff', viewer: 'Viewer' };

const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

function friendlyDbError(message: string): string {
  if (message.includes('at least one owner')) return 'A workspace must keep at least one owner. Make someone else an owner first.';
  if (message.includes('invitations_open_per_email') || message.includes('duplicate key')) return 'That email already has an open invitation.';
  if (message.includes('row-level security') || message.includes('permission denied')) return 'You do not have permission to do that.';
  return 'Something went wrong. Please try again.';
}

const CopyLink: React.FC<{ token: string }> = ({ token }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(inviteLink(token)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
        catch { toast.error('Could not copy. Select the link and copy it manually.'); }
      }}
      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy invite link'}
    </button>
  );
};

/** Step 1.5: members, roles and invitations for the current workspace. */
export const Team: React.FC = () => {
  const { workspace, refreshWorkspaces } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('staff');
  const [busy, setBusy] = useState(false);
  const [lastInvite, setLastInvite] = useState<Invitation | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const myRole = workspace?.role;
  const isOwner = myRole === 'owner';
  const canInvite = myRole === 'owner' || myRole === 'manager';
  const invitableRoles: MemberRole[] = isOwner ? ['manager', 'staff', 'viewer'] : ['staff', 'viewer'];

  const load = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const [team, inv] = await Promise.all([
      supabase.rpc('list_team', { p_org: workspace.id }),
      canInvite
        ? supabase.from('invitations').select('id, email, role, token, expires_at')
            .eq('org_id', workspace.id).is('accepted_at', null).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    setLoading(false);
    if (team.error) { toast.error('Could not load the team.'); return; }
    setMembers((team.data ?? []) as Member[]);
    setInvites(((inv.data ?? []) as Invitation[]).filter(i => Date.parse(i.expires_at) > Date.now()));
  }, [workspace?.id, canInvite]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (!workspace) return null;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { toast.error('Enter a valid email address.'); return; }
    if (members.some(m => m.email.toLowerCase() === clean)) { toast.error('That person is already on the team.'); return; }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('invitations')
      .insert({ org_id: workspace.id, email: clean, role, invited_by: auth.user?.id })
      .select('id, email, role, token, expires_at').single();
    setBusy(false);
    if (error) { toast.error(friendlyDbError(error.message)); return; }
    setLastInvite(data as Invitation);
    setEmail('');
    load();
  };

  const changeRole = async (m: Member, next: MemberRole) => {
    const { error } = await supabase.from('memberships').update({ role: next }).eq('id', m.membership_id);
    if (error) { toast.error(friendlyDbError(error.message)); return; }
    toast.success(`${m.full_name || m.email} is now ${ROLE_LABEL[next].toLowerCase()}.`);
    if (m.is_me) await refreshWorkspaces();
    load();
  };

  const remove = async (m: Member) => {
    setConfirmRemove(null);
    const { error } = await supabase.from('memberships').delete().eq('id', m.membership_id);
    if (error) { toast.error(friendlyDbError(error.message)); return; }
    if (m.is_me) { toast.success(`You left ${workspace.name}.`); await refreshWorkspaces(); return; }
    toast.success(`${m.full_name || m.email} was removed.`);
    load();
  };

  const revoke = async (i: Invitation) => {
    const { error } = await supabase.from('invitations').delete().eq('id', i.id);
    if (error) { toast.error(friendlyDbError(error.message)); return; }
    if (lastInvite?.id === i.id) setLastInvite(null);
    load();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {canInvite && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-zinc-900">Invite a team member</h3>
          <form onSubmit={invite} className="mt-4 flex flex-col sm:flex-row gap-3" noValidate>
            <label className="sr-only" htmlFor="invite-email">Email</label>
            <input id="invite-email" type="email" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)}
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
            <label className="sr-only" htmlFor="invite-role">Role</label>
            <select id="invite-role" value={role} onChange={e => setRole(e.target.value as MemberRole)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm">
              {invitableRoles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <Button type="submit" disabled={busy || !email}><UserPlus size={14} /> {busy ? 'Inviting…' : 'Invite'}</Button>
          </form>
          <p className="mt-2 text-[11px] text-zinc-400">{ROLE_LABEL[role]}: {ROLE_INFO[role]}.</p>
          {lastInvite && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
              Invitation created for <span className="font-medium">{lastInvite.email}</span>. Emails are not sent automatically yet,
              so copy the link and send it to them. It works for 7 days.
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <code className="rounded bg-white px-2 py-1 text-[11px] text-zinc-600 break-all">{inviteLink(lastInvite.token)}</code>
                <CopyLink token={lastInvite.token} />
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Members</h3>
          <span className="text-xs text-zinc-400">{members.length} {members.length === 1 ? 'person' : 'people'}</span>
        </div>
        {loading ? (
          <p className="px-5 py-6 text-sm text-zinc-400">Loading…</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {members.map(m => (
              <li key={m.membership_id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{m.full_name || m.email}{m.is_me && <span className="ml-2 text-[10px] font-normal text-zinc-400">You</span>}</p>
                  {m.full_name && <p className="text-xs text-zinc-500 truncate">{m.email}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {isOwner ? (
                    <select aria-label={`Role for ${m.email}`} value={m.role} onChange={e => changeRole(m, e.target.value as MemberRole)}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs">
                      {(Object.keys(ROLE_LABEL) as MemberRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-zinc-600">{ROLE_LABEL[m.role]}</span>
                  )}
                  {(isOwner || m.is_me) && (
                    confirmRemove === m.membership_id ? (
                      <span className="flex items-center gap-2 text-xs">
                        <button className="font-medium text-rose-600 hover:underline" onClick={() => remove(m)}>{m.is_me ? 'Leave' : 'Remove'}</button>
                        <button className="text-zinc-500 hover:underline" onClick={() => setConfirmRemove(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button title={m.is_me ? 'Leave workspace' : 'Remove from workspace'} aria-label={m.is_me ? 'Leave workspace' : `Remove ${m.email}`}
                        onClick={() => setConfirmRemove(m.membership_id)}
                        className={cn('p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50')}>
                        {m.is_me ? <LogOut size={14} /> : <Trash2 size={14} />}
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canInvite && invites.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100"><h3 className="text-sm font-semibold text-zinc-900">Pending invitations</h3></div>
          <ul className="divide-y divide-zinc-100">
            {invites.map(i => (
              <li key={i.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-900 truncate">{i.email}</p>
                  <p className="text-xs text-zinc-500">{ROLE_LABEL[i.role]} · expires {new Date(i.expires_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-4">
                  <CopyLink token={i.token} />
                  <button className="text-xs text-zinc-500 hover:text-rose-600 hover:underline" onClick={() => revoke(i)}>Revoke</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-zinc-900">What each role can do</h3>
        <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {(Object.keys(ROLE_INFO) as MemberRole[]).map(r => (
            <div key={r} className="flex gap-2"><dt className="w-16 shrink-0 font-medium text-zinc-700">{ROLE_LABEL[r]}</dt><dd className="text-zinc-500">{ROLE_INFO[r]}</dd></div>
          ))}
        </dl>
      </Card>
    </div>
  );
};
