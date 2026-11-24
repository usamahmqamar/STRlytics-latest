/**
 * Owners: who owns each property (entities and their shares), the representative who manages a
 * co-owned property, owner-report preferences, and owner statements as PDFs.
 * Owners and managers only.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Building2, Copy, Download, FileText, KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Sheet, fieldClass } from './ui/Sheet';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { SUPPORTED_CURRENCIES, formatMoney, type Rates } from '../lib/money';
import { StatementDetails } from './StatementDetails';
import { countryOptions } from '../lib/regions';
import { buildStatement, lastPeriod, sharesOn } from '../lib/ownerStatement';
import {
  cancelOwnerInvite, deleteEntity, inviteOwner, loadOwnerAccess, loadOwners, loadPreparedStatements, nominateRepresentative,
  optBackIn, optOutOfReports, ownerInviteLink, recordApproval, removeOwnerLogins, saveEntity, setShares, uploadOwnerLetter,
  type Entity, type EntityInput, type OwnerInvite, type OwnerLogin, type OwnersData, type PreparedStatement, type ReportFrequency,
} from '../services/owners';
import { useAuth, type Workspace } from '../auth/AuthProvider';
import type { UserData } from '../types';

interface Member { user_id: string; full_name: string | null; email: string; role: string }

const FREQUENCY: Record<ReportFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  monthly_and_yearly: 'Monthly, plus a yearly summary',
};
const today = () => format(new Date(), 'yyyy-MM-dd');
const day = (iso: string) => format(parseISO(iso), 'd MMM yyyy');

export const Owners: React.FC<{ workspace: Workspace; data: UserData; rates: Rates; baseCurrency: string; canWrite: boolean }> = ({
  workspace, data, rates, baseCurrency, canWrite,
}) => {
  const [tab, setTab] = useState<'owners' | 'properties' | 'statements'>('owners');
  const [owners, setOwners] = useState<OwnersData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [o, team] = await Promise.all([loadOwners(workspace.id), supabase.rpc('list_team', { p_org: workspace.id })]);
      setOwners(o);
      setMembers(((team.data ?? []) as Member[]).filter(m => m.role === 'owner' || m.role === 'manager'));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load owners.');
    }
  }, [workspace.id]);
  useEffect(() => { reload(); }, [reload]);

  if (error) return <Card><p className="text-sm text-rose-600">{error}</p></Card>;
  if (!owners) return <div className="flex items-center gap-2 p-8 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Loading owners…</div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-prose text-sm text-zinc-500">
          Who owns each property, who manages it for the owners, and the statements they receive.
        </p>
        <div role="tablist" className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {([['owners', 'Owners'], ['properties', 'Property ownership'], ['statements', 'Statements']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={cn('rounded-md px-3 py-1.5 font-medium', tab === id ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400')}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'owners' && <OwnersList orgId={workspace.id} owners={owners} data={data} baseCurrency={baseCurrency} canWrite={canWrite} onChanged={reload} />}
      {tab === 'properties' && <PropertyOwnership orgId={workspace.id} owners={owners} data={data} members={members} canWrite={canWrite} onChanged={reload} />}
      {tab === 'statements' && <Statements orgId={workspace.id} owners={owners} data={data} rates={rates} baseCurrency={baseCurrency} workspaceName={workspace.name} />}
    </div>
  );
};

/* ------------------------------------------------------------------ owners list */

const OwnersList: React.FC<{ orgId: string; owners: OwnersData; data: UserData; baseCurrency: string; canWrite: boolean; onChanged: () => Promise<void> }> = ({
  orgId, owners, data, baseCurrency, canWrite, onChanged,
}) => {
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [optingOut, setOptingOut] = useState<Entity | null>(null);
  const [access, setAccess] = useState<Entity | null>(null);
  const propertiesOf = (id: string) => {
    const props = new Set(owners.shares.filter(s => s.entity_id === id).map(s => s.property_id));
    return data.apartments.filter(a => props.has(a.apartment_id) && (sharesOn(owners.shares, a.apartment_id, today()).get(id) ?? 0) > 0);
  };

  return (
    <>
      <Card
        title="Owners"
        action={canWrite && <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Add owner</Button>}
      >
        <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          An owner is the person or company whose books a property sits in: the one that earns the income, pays the costs and
          files the tax return. Add yourself, your companies and any co-owners.
        </p>
        {owners.entities.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No owners yet. Start with yourself or your company.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3 font-medium">Owner</th>
                  <th className="py-2 pr-3 font-medium">Tax residence</th>
                  <th className="py-2 pr-3 font-medium">Reports in</th>
                  <th className="py-2 pr-3 font-medium">Owns today</th>
                  <th className="py-2 pr-3 font-medium">Owner reports</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {owners.entities.map(e => {
                  const props = propertiesOf(e.id);
                  return (
                    <tr key={e.id} className="border-b border-zinc-100 align-top dark:border-zinc-800/60">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{e.name}</p>
                        <p className="text-xs text-zinc-500">{e.kind === 'company' ? (e.legal_form || 'Company') : 'Individual'}</p>
                      </td>
                      <td className="py-3 pr-3 text-zinc-700 dark:text-zinc-300">{e.tax_country || '—'}</td>
                      <td className="py-3 pr-3 text-zinc-700 dark:text-zinc-300">{e.reporting_currency}</td>
                      <td className="py-3 pr-3 text-zinc-700 dark:text-zinc-300">
                        {props.length ? props.map(p => `${p.name} (${sharesOn(owners.shares, p.apartment_id, today()).get(e.id)}%)`).join(', ') : '—'}
                      </td>
                      <td className="py-3 pr-3">
                        {e.reports_opted_out_at ? (
                          <span className="text-xs text-amber-700">Stopped on {day(e.reports_opted_out_at.slice(0, 10))} at the owner's request</span>
                        ) : e.report_email ? (
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">{FREQUENCY[e.report_frequency]} to {e.report_email}</span>
                        ) : (
                          <span className="text-xs text-zinc-500">No email yet</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {canWrite && (
                          <div className="flex justify-end gap-1">
                            {e.reports_opted_out_at ? (
                              <Button size="sm" variant="ghost" onClick={async () => {
                                try { await optBackIn(orgId, e.id); toast.success('Reports restarted.'); await onChanged(); }
                                catch (err: any) { toast.error(err.message); }
                              }}>Restart reports</Button>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => setOptingOut(e)}>Stop reports</Button>
                            )}
                            <Button size="sm" variant="ghost" aria-label={`Login for ${e.name}`} title="Owner login" onClick={() => setAccess(e)}><KeyRound size={14} /></Button>
                            <Button size="sm" variant="ghost" aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)}><Pencil size={14} /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <EntitySheet orgId={orgId} entity={editing === 'new' ? null : editing} baseCurrency={baseCurrency}
          holdsShares={editing !== 'new' && owners.shares.some(s => s.entity_id === editing.id)}
          onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onChanged(); }} />
      )}
      {access && <AccessSheet orgId={orgId} entity={access} onClose={() => setAccess(null)} />}
      {optingOut && (
        <OptOutSheet orgId={orgId} entity={optingOut} onClose={() => setOptingOut(null)}
          onSaved={async () => { setOptingOut(null); await onChanged(); }} />
      )}
    </>
  );
};

const EntitySheet: React.FC<{
  orgId: string; entity: Entity | null; baseCurrency: string; holdsShares: boolean;
  onClose: () => void; onSaved: () => Promise<void>;
}> = ({ orgId, entity, baseCurrency, holdsShares, onClose, onSaved }) => {
  const countries = useMemo(() => countryOptions(), []);
  const [f, setF] = useState<EntityInput>({
    name: entity?.name ?? '',
    kind: entity?.kind ?? 'individual',
    legal_form: entity?.legal_form ?? '',
    tax_country: entity?.tax_country ?? '',
    tax_id: entity?.tax_id ?? '',
    reporting_currency: entity?.reporting_currency ?? baseCurrency,
    report_email: entity?.report_email ?? '',
    report_frequency: entity?.report_frequency ?? 'monthly',
    notes: entity?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EntityInput>(k: K) => (v: EntityInput[K]) => setF(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) { toast.error('Give the owner a name.'); return; }
    setBusy(true);
    try { await saveEntity(orgId, f, entity?.id); toast.success('Owner saved.'); await onSaved(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!entity || !window.confirm(`Remove ${entity.name}?`)) return;
    setBusy(true);
    try { await deleteEntity(orgId, entity.id); toast.success('Owner removed.'); await onSaved(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={entity ? `Edit ${entity.name}` : 'Add owner'}
      description="The person or company whose books a property sits in."
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {entity && !holdsShares ? <Button variant="ghost" onClick={remove} disabled={busy}><Trash2 size={14} /> Remove</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">Name
          <input className={cn(fieldClass, 'mt-1')} maxLength={200} value={f.name} onChange={e => set('name')(e.target.value)} placeholder="e.g. Usamah Qamar, or XYZ Holiday Homes FZ-LLC" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">Type
            <select className={cn(fieldClass, 'mt-1')} value={f.kind} onChange={e => set('kind')(e.target.value as any)}>
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
          </label>
          {f.kind === 'company' && (
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">Legal form
              <input className={cn(fieldClass, 'mt-1')} maxLength={60} value={f.legal_form ?? ''} onChange={e => set('legal_form')(e.target.value)} placeholder="LLC, FZ-LLC, Pvt Ltd" />
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">Tax residence
            <select className={cn(fieldClass, 'mt-1')} value={f.tax_country ?? ''} onChange={e => set('tax_country')(e.target.value)}>
              <option value="">Not set</option>
              {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">Reporting currency
            <select className={cn(fieldClass, 'mt-1')} value={f.reporting_currency} onChange={e => set('reporting_currency')(e.target.value)}>
              {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">Tax or registration number <span className="text-zinc-400">(optional; owners and managers only)</span>
          <input className={cn(fieldClass, 'mt-1')} maxLength={60} value={f.tax_id ?? ''} onChange={e => set('tax_id')(e.target.value)} autoComplete="off" />
        </label>
        <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Owner reports</p>
          <p className="mt-1 text-xs text-zinc-500">Sent by email as a PDF unless the owner asks to stop.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">Email
              <input type="email" className={cn(fieldClass, 'mt-1')} maxLength={254} value={f.report_email ?? ''} onChange={e => set('report_email')(e.target.value)} />
            </label>
            <label className="block text-xs text-zinc-600 dark:text-zinc-400">How often
              <select className={cn(fieldClass, 'mt-1')} value={f.report_frequency} onChange={e => set('report_frequency')(e.target.value as ReportFrequency)}>
                {Object.entries(FREQUENCY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        </div>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">Notes
          <textarea className={cn(fieldClass, 'mt-1 h-20 py-2')} maxLength={2000} value={f.notes ?? ''} onChange={e => set('notes')(e.target.value)} />
        </label>
        {entity && holdsShares && <p className="text-xs text-zinc-500">This owner holds shares in a property, so it can't be removed.</p>}
      </div>
    </Sheet>
  );
};

/** Evidence for an owner's decision: an uploaded letter (PDF or text) or their email pasted in. */
const Evidence: React.FC<{ orgId: string; onReady: (e: { documentId: string | null; note: string }) => void }> = ({ orgId, onReady }) => {
  const [note, setNote] = useState('');
  const [doc, setDoc] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { onReady({ documentId: doc?.id ?? null, note }); }, [doc, note]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">Upload their letter or saved email (PDF or text)
        <input type="file" accept=".pdf,.txt,application/pdf,text/plain" className="mt-1 block w-full text-xs"
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try { const d = await uploadOwnerLetter(orgId, file); setDoc({ id: d.id, name: d.file_name }); }
            catch (err: any) { toast.error(err.message); }
            finally { setUploading(false); }
          }} />
      </label>
      {uploading && <p className="text-xs text-zinc-500">Uploading…</p>}
      {doc && <p className="flex items-center gap-1 text-xs text-emerald-700"><FileText size={12} /> {doc.name} attached</p>}
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">Or paste their email
        <textarea className={cn(fieldClass, 'mt-1 h-24 py-2')} maxLength={2000} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Date, sender and what they said" />
      </label>
    </div>
  );
};

const OptOutSheet: React.FC<{ orgId: string; entity: Entity; onClose: () => void; onSaved: () => Promise<void> }> = ({ orgId, entity, onClose, onSaved }) => {
  const [ev, setEv] = useState<{ documentId: string | null; note: string }>({ documentId: null, note: '' });
  const [busy, setBusy] = useState(false);
  const ready = !!ev.documentId || ev.note.trim().length > 0;
  return (
    <Sheet open onClose={onClose} title={`Stop reports to ${entity.name}`}
      description="Reports stop only when the owner asks, by email or letter. Keep their request here."
      footer={<div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!ready || busy} onClick={async () => {
          setBusy(true);
          try { await optOutOfReports(orgId, entity.id, ev); toast.success('Reports stopped.'); await onSaved(); }
          catch (e: any) { toast.error(e.message); }
          finally { setBusy(false); }
        }}>Stop reports</Button>
      </div>}>
      <Evidence orgId={orgId} onReady={setEv} />
    </Sheet>
  );
};

/** Lets an owner sign in to see their own statements (and nothing else in the workspace). */
const AccessSheet: React.FC<{ orgId: string; entity: Entity; onClose: () => void }> = ({ orgId, entity, onClose }) => {
  const { user } = useAuth();
  const [invites, setInvites] = useState<OwnerInvite[] | null>(null);
  const [logins, setLogins] = useState<OwnerLogin[]>([]);
  const [email, setEmail] = useState(entity.report_email ?? '');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try {
      const a = await loadOwnerAccess(orgId);
      setInvites(a.invites.filter(i => i.entity_id === entity.id));
      setLogins(a.logins.filter(l => l.entity_id === entity.id));
    } catch (e: any) { toast.error(e.message); setInvites([]); }
  }, [orgId, entity.id]);
  useEffect(() => { reload(); }, [reload]);
  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(ownerInviteLink(token)); toast.success('Link copied. Send it to the owner.'); }
    catch { toast.error('Could not copy. Select the link and copy it.'); }
  };
  const now = Date.now();
  return (
    <Sheet open onClose={onClose} title={`Owner login for ${entity.name}`}
      description="The owner sees only their own statements: this month so far and every statement prepared for them. Nothing else in your workspace."
      footer={<div className="flex justify-end"><Button variant="outline" onClick={onClose}>Done</Button></div>}>
      <div className="space-y-5">
        <div className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          {logins.length ? (
            <div className="flex items-center justify-between gap-2">
              <span>{logins.length === 1 ? 'One person can sign in' : `${logins.length} people can sign in`} to see these statements.</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
                if (!window.confirm(`Remove every login to ${entity.name}'s statements?`)) return;
                setBusy(true);
                try { await removeOwnerLogins(orgId, entity.id); toast.success('Access removed.'); await reload(); }
                catch (e: any) { toast.error(e.message); }
                finally { setBusy(false); }
              }}>Remove access</Button>
            </div>
          ) : <span className="text-zinc-500">Nobody can sign in to these statements yet.</span>}
        </div>

        <div>
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Invite the owner</p>
          <p className="mt-1 text-xs text-zinc-500">They create an account with this email, or sign in if they already have one. The link works for 14 days.</p>
          <div className="mt-2 flex gap-2">
            <input type="email" aria-label="Owner's email" className={cn(fieldClass, 'flex-1')} value={email} onChange={e => setEmail(e.target.value)} maxLength={254} />
            <Button disabled={busy || !email.trim() || !user} onClick={async () => {
              setBusy(true);
              try { const inv = await inviteOwner(orgId, entity.id, email, user!.id); await copy(inv.token); await reload(); }
              catch (e: any) { toast.error(e.message); }
              finally { setBusy(false); }
            }}>Create link</Button>
          </div>
        </div>

        {invites && invites.length > 0 && (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {invites.map(i => {
              const expired = !i.accepted_at && Date.parse(i.expires_at) <= now;
              return (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{i.email}</span>
                    <span className={cn('text-xs', i.accepted_at ? 'text-emerald-700' : expired ? 'text-zinc-400' : 'text-amber-700')}>
                      {i.accepted_at ? `Accepted ${day(i.accepted_at.slice(0, 10))}` : expired ? 'Expired' : `Waiting, until ${day(i.expires_at.slice(0, 10))}`}
                    </span>
                  </span>
                  {!i.accepted_at && (
                    <span className="flex shrink-0 gap-1">
                      {!expired && <Button size="sm" variant="ghost" aria-label="Copy link" onClick={() => copy(i.token)}><Copy size={14} /></Button>}
                      <Button size="sm" variant="ghost" aria-label="Cancel invitation" onClick={async () => {
                        try { await cancelOwnerInvite(orgId, i.id); await reload(); } catch (e: any) { toast.error(e.message); }
                      }}><Trash2 size={14} /></Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ property ownership */

const PropertyOwnership: React.FC<{
  orgId: string; owners: OwnersData; data: UserData; members: Member[]; canWrite: boolean; onChanged: () => Promise<void>;
}> = ({ orgId, owners, data, members, canWrite, onChanged }) => {
  const [sharesFor, setSharesFor] = useState<string | null>(null);
  const [approving, setApproving] = useState<{ nominationId: string; propertyId: string } | null>(null);
  const name = (id: string) => owners.entities.find(e => e.id === id)?.name ?? 'Unknown owner';
  const person = (uid: string) => { const m = members.find(x => x.user_id === uid); return m ? (m.full_name || m.email) : 'A former member'; };

  if (!data.apartments.length) return <Card><p className="text-sm text-zinc-500">Add a property first.</p></Card>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.apartments.map(apt => {
        const current = sharesOn(owners.shares, apt.apartment_id, today());
        const history = [...new Set(owners.shares.filter(s => s.property_id === apt.apartment_id).map(s => s.effective_from))].sort().reverse();
        const rep = owners.nominations.find(n => n.property_id === apt.apartment_id && n.status === 'approved');
        const pending = owners.nominations.find(n => n.property_id === apt.apartment_id && n.status === 'pending');
        const approvedPct = pending
          ? [...current].filter(([eid]) => owners.approvals.some(a => a.nomination_id === pending.id && a.entity_id === eid)).reduce((t, [, s]) => t + s, 0)
          : 0;
        return (
          <Card key={apt.apartment_id} title={<span className="flex items-center gap-2"><Building2 size={16} className="text-zinc-400" /> {apt.name}</span>}
            action={canWrite && owners.entities.length > 0 && <Button size="sm" variant="outline" onClick={() => setSharesFor(apt.apartment_id)}>Change ownership</Button>}>
            {current.size === 0 ? (
              <p className="text-sm text-zinc-500">{owners.entities.length ? 'No owners recorded yet.' : 'Add owners on the Owners tab first.'}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {[...current].sort((a, b) => b[1] - a[1]).map(([eid, s]) => (
                  <li key={eid} className="flex items-center justify-between">
                    <span className="text-zinc-800 dark:text-zinc-200">{name(eid)}</span>
                    <span className="font-medium tabular-nums">{s}%</span>
                  </li>
                ))}
              </ul>
            )}
            {history.length > 1 && (
              <p className="mt-2 text-xs text-zinc-500">Current split since {day(history.find(d => d <= today()) ?? history[0])}; {history.length - 1} earlier split{history.length > 2 ? 's' : ''} kept for past statements.</p>
            )}

            {current.size > 0 && (
              <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300"><ShieldCheck size={13} /> Representative</p>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {rep ? <>{person(rep.nominee_user_id)}, approved {rep.approved_at ? day(rep.approved_at.slice(0, 10)) : ''}</> : 'None approved yet.'}
                </p>
                {pending && (
                  <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    {person(pending.nominee_user_id)} is nominated. Approved by owners holding {approvedPct}%; needs more than 50%.
                    {canWrite && <button className="ml-2 font-semibold underline" onClick={() => setApproving({ nominationId: pending.id, propertyId: apt.apartment_id })}>Record an approval</button>}
                  </div>
                )}
                {canWrite && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {rep || pending ? 'Nominate someone else' : 'Nominate'}
                    <select className={cn(fieldClass, 'h-8 w-auto text-xs')} value="" onChange={async e => {
                      if (!e.target.value) return;
                      try { await nominateRepresentative(orgId, apt.apartment_id, e.target.value); toast.success('Nominated. Record the owners\' approvals next.'); await onChanged(); }
                      catch (err: any) { toast.error(err.message); }
                    }}>
                      <option value="">Choose a team member</option>
                      {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}
          </Card>
        );
      })}
      {sharesFor && (
        <SharesSheet orgId={orgId} owners={owners} propertyId={sharesFor} propertyName={data.apartments.find(a => a.apartment_id === sharesFor)?.name ?? ''}
          onClose={() => setSharesFor(null)} onSaved={async () => { setSharesFor(null); await onChanged(); }} />
      )}
      {approving && (
        <ApprovalSheet orgId={orgId} owners={owners} {...approving}
          onClose={() => setApproving(null)} onSaved={async () => { setApproving(null); await onChanged(); }} />
      )}
    </div>
  );
};

const SharesSheet: React.FC<{
  orgId: string; owners: OwnersData; propertyId: string; propertyName: string; onClose: () => void; onSaved: () => Promise<void>;
}> = ({ orgId, owners, propertyId, propertyName, onClose, onSaved }) => {
  const current = sharesOn(owners.shares, propertyId, today());
  const [from, setFrom] = useState(current.size ? today() : format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'));
  const [rows, setRows] = useState<{ entity_id: string; share: string }[]>(
    current.size ? [...current].map(([entity_id, s]) => ({ entity_id, share: String(s) })) : [{ entity_id: owners.entities[0]?.id ?? '', share: '100' }],
  );
  const [busy, setBusy] = useState(false);
  const total = rows.reduce((t, r) => t + (Number(r.share) || 0), 0);
  const ok = Math.abs(total - 100) < 0.001 && rows.every(r => r.entity_id && Number(r.share) > 0) && new Set(rows.map(r => r.entity_id)).size === rows.length;

  return (
    <Sheet open onClose={onClose} title={`Ownership of ${propertyName}`}
      description="Shares apply from the date you choose. Earlier splits stay as they were, so past statements don't change."
      footer={<div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs', ok ? 'text-emerald-700' : 'text-rose-600')}>Total {Math.round(total * 1000) / 1000}%{ok ? '' : ' (must be 100%)'}</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!ok || busy} onClick={async () => {
            setBusy(true);
            try { await setShares(orgId, propertyId, from, rows.map(r => ({ entity_id: r.entity_id, share: Number(r.share) }))); toast.success('Ownership saved.'); await onSaved(); }
            catch (e: any) { toast.error(e.message); }
            finally { setBusy(false); }
          }}>Save</Button>
        </div>
      </div>}>
      <div className="space-y-4">
        <label className="block max-w-xs text-xs text-zinc-600 dark:text-zinc-400">Applies from
          <input type="date" className={cn(fieldClass, 'mt-1')} value={from} onChange={e => setFrom(e.target.value)} />
        </label>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select aria-label="Owner" className={cn(fieldClass, 'flex-1')} value={r.entity_id}
                onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, entity_id: e.target.value } : x)))}>
                <option value="">Choose an owner</option>
                {owners.entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <div className="relative w-28">
                <input aria-label="Share" type="number" min="0" max="100" step="0.001" className={cn(fieldClass, 'pr-7 text-right')} value={r.share}
                  onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)))} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">%</span>
              </div>
              {rows.length > 1 && <Button size="sm" variant="ghost" aria-label="Remove owner" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>}
            </div>
          ))}
        </div>
        {rows.length < owners.entities.length && (
          <Button size="sm" variant="outline" onClick={() => setRows([...rows, { entity_id: '', share: String(Math.max(0, 100 - total)) }])}><Plus size={14} /> Add a co-owner</Button>
        )}
      </div>
    </Sheet>
  );
};

const ApprovalSheet: React.FC<{
  orgId: string; owners: OwnersData; nominationId: string; propertyId: string; onClose: () => void; onSaved: () => Promise<void>;
}> = ({ orgId, owners, nominationId, propertyId, onClose, onSaved }) => {
  const current = sharesOn(owners.shares, propertyId, today());
  const waiting = [...current].filter(([eid]) => !owners.approvals.some(a => a.nomination_id === nominationId && a.entity_id === eid));
  const [entityId, setEntityId] = useState(waiting[0]?.[0] ?? '');
  const [ev, setEv] = useState<{ documentId: string | null; note: string }>({ documentId: null, note: '' });
  const [busy, setBusy] = useState(false);
  const ready = !!entityId && (!!ev.documentId || ev.note.trim().length > 0);
  return (
    <Sheet open onClose={onClose} title="Record an owner's approval"
      description="Co-owners don't log in. Record each approval with their email or letter as evidence."
      footer={<div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!ready || busy} onClick={async () => {
          setBusy(true);
          try {
            const status = await recordApproval(orgId, nominationId, entityId, ev);
            toast.success(status === 'approved' ? 'Approved by a majority. The representative is now in place.' : 'Approval recorded. More is needed for a majority.');
            await onSaved();
          } catch (e: any) { toast.error(e.message); }
          finally { setBusy(false); }
        }}><UserCheck size={14} /> Record approval</Button>
      </div>}>
      <div className="space-y-4">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">Owner approving
          <select className={cn(fieldClass, 'mt-1')} value={entityId} onChange={e => setEntityId(e.target.value)}>
            {waiting.map(([eid, s]) => <option key={eid} value={eid}>{owners.entities.find(x => x.id === eid)?.name} ({s}%)</option>)}
          </select>
        </label>
        <Evidence orgId={orgId} onReady={setEv} />
      </div>
    </Sheet>
  );
};

/* ------------------------------------------------------------------ statements */

const EMAIL_STATUS: Record<NonNullable<PreparedStatement['email_status']>, string> = {
  sent: 'Emailed', failed: 'Email failed; retried for a week', opted_out: 'Not emailed: owner opted out',
  no_email: 'Not emailed: no email address', not_configured: 'Not emailed yet: email sending is not set up',
};

const Statements: React.FC<{ orgId: string; owners: OwnersData; data: UserData; rates: Rates; baseCurrency: string; workspaceName: string }> = ({
  orgId, owners, data, rates, baseCurrency, workspaceName,
}) => {
  const [prepared, setPrepared] = useState<PreparedStatement[] | null>(null);
  const initial = lastPeriod('monthly', new Date());
  const [entityId, setEntityId] = useState(owners.entities[0]?.id ?? '');
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [busy, setBusy] = useState(false);
  const entity = owners.entities.find(e => e.id === entityId);
  useEffect(() => {
    if (!entityId) return;
    setPrepared(null);
    loadPreparedStatements(orgId, entityId).then(setPrepared).catch(() => setPrepared([]));
  }, [orgId, entityId]);
  const downloadPrepared = async (p: PreparedStatement) => {
    if (!entity) return;
    const { statementPdf } = await import('../lib/statementPdf');
    const bytes = await statementPdf(p.statement, { ownerName: entity.name, workspaceName });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `owner-statement-${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${p.period_start}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const statement = useMemo(() => (entity && start <= end
    ? buildStatement({ data, rates, baseCurrency, shares: owners.shares, entityId: entity.id, reportingCurrency: entity.reporting_currency, start, end })
    : null), [entity, start, end, data, rates, baseCurrency, owners.shares]);

  const download = async () => {
    if (!statement || !entity) return;
    setBusy(true);
    try {
      const { statementPdf } = await import('../lib/statementPdf');
      const bytes = await statementPdf(statement, { ownerName: entity.name, workspaceName });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `owner-statement-${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${start}-to-${end}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch { toast.error('Could not make the PDF. Please try again.'); }
    finally { setBusy(false); }
  };

  if (!owners.entities.length) return <Card><p className="text-sm text-zinc-500">Add owners and their shares first.</p></Card>;

  return (
    <Card title="Owner statement" action={<Button size="sm" onClick={download} disabled={!statement || busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF</Button>}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">Owner
          <select className={cn(fieldClass, 'mt-1 block w-56')} value={entityId} onChange={e => setEntityId(e.target.value)}>
            {owners.entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">From
          <input type="date" className={cn(fieldClass, 'mt-1')} value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label className="block text-xs text-zinc-600 dark:text-zinc-400">To
          <input type="date" className={cn(fieldClass, 'mt-1')} value={end} onChange={e => setEnd(e.target.value)} />
        </label>
      </div>

      {statement && (
        <div className="mt-5">
          <p className="text-xs text-zinc-500">{entity?.name}'s share of profit</p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(statement.totalReporting, statement.reportingCurrency)}</p>
          {statement.lines.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">This owner held no shares in any property during these dates.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-3 font-medium">Property</th>
                    <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                    <th className="py-2 pr-3 text-right font-medium">Costs</th>
                    <th className="py-2 pr-3 text-right font-medium">Profit</th>
                    <th className="py-2 pr-3 text-right font-medium">Share</th>
                    <th className="py-2 text-right font-medium">Their part</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map(l => (
                    <tr key={l.propertyId} className="border-b border-zinc-100 dark:border-zinc-800/60">
                      <td className="py-2.5 pr-3">{l.propertyName}<span className="block text-xs text-zinc-500">{l.nightsBooked} nights booked</span></td>
                      <td className="py-2.5 pr-3 text-right">{formatMoney(l.revenue, l.currency)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatMoney(l.costs, l.currency)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatMoney(l.profit, l.currency)}</td>
                      <td className="py-2.5 pr-3 text-right">{l.shareStart === l.shareEnd ? `${l.shareEnd}%` : `${l.shareStart}% → ${l.shareEnd}%`}</td>
                      <td className="py-2.5 text-right font-medium">
                        {formatMoney(l.ownerProfit, l.currency)}
                        {l.currency !== statement.reportingCurrency && <span className="block text-xs font-normal text-zinc-500">{formatMoney(l.ownerProfitReporting, statement.reportingCurrency)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {statement.lines.length > 0 && <StatementDetails statement={statement} />}
          {statement.missingRates.length > 0 && (
            <p className="mt-3 text-xs text-amber-700">No exchange rate yet for {statement.missingRates.join(', ')} on some days; those days are left out of the total.</p>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500"><Users size={12} />
            {entity?.reports_opted_out_at ? 'This owner asked not to receive reports.' : entity?.report_email ? `${FREQUENCY[entity.report_frequency]} statements are prepared automatically and emailed to ${entity.report_email}.` : 'Add an email to send this owner reports.'}
          </p>
        </div>
      )}

      <div className="mt-8 border-t border-zinc-100 pt-5 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Prepared statements</h3>
        <p className="mt-1 text-xs text-zinc-500">Made automatically each day for {entity?.name}: this month so far, and each finished {entity?.report_frequency === 'quarterly' ? 'quarter' : 'month'}. The owner sees the same ones if they have a login.</p>
        {!prepared ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Loading…</p>
        ) : prepared.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">None yet. The first ones appear the day after the daily job runs.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {prepared.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {p.kind === 'month_to_date' ? 'This month so far' : p.kind === 'yearly' ? p.period_start.slice(0, 4) : p.kind === 'quarterly' ? `Q${Math.floor((Number(p.period_start.slice(5, 7)) - 1) / 3) + 1} ${p.period_start.slice(0, 4)}` : format(parseISO(p.period_start), 'MMMM yyyy')}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {formatMoney(p.total, p.currency)}{p.kind !== 'month_to_date' && p.email_status ? ` · ${EMAIL_STATUS[p.email_status]}` : ''}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => downloadPrepared(p)}><Download size={14} /> PDF</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
};
