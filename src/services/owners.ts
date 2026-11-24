/**
 * Entities (who owns what), their shares in each property, representatives and owner-report
 * preferences. Owners and managers only; the database enforces it.
 */
import { supabase } from '../lib/supabase';
import { uploadDocument, type SourceDocument } from './finance';

export type EntityKind = 'individual' | 'company';
export type ReportFrequency = 'monthly' | 'quarterly' | 'monthly_and_yearly';

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  legal_form: string | null;
  tax_country: string | null;
  tax_id: string | null;
  reporting_currency: string;
  report_email: string | null;
  report_frequency: ReportFrequency;
  reports_opted_out_at: string | null;
  opt_out_document_id: string | null;
  opt_out_note: string | null;
  notes: string | null;
  created_at: string;
}

export interface ListingShare { property_id: string; entity_id: string; effective_from: string; share: number }

export interface Nomination {
  id: string;
  property_id: string;
  nominee_user_id: string;
  status: 'pending' | 'approved' | 'replaced';
  nominated_at: string;
  approved_at: string | null;
}

export interface Approval {
  nomination_id: string;
  entity_id: string;
  share_at_approval: number;
  evidence_document_id: string | null;
  note: string | null;
  recorded_at: string;
}

export interface OwnersData {
  entities: Entity[];
  shares: ListingShare[];
  nominations: Nomination[];
  approvals: Approval[];
}

const MESSAGES: Record<string, string> = {
  '42501': 'Only owners and managers can change ownership.',
  '23505': 'An owner with that name already exists.',
  '23503': 'This owner still holds shares or approvals, so it cannot be removed.',
};

function fail(error: any, fallback: string): never {
  console.error(fallback, error?.code || error?.message || error);
  // Rule messages from the database functions (code 22023) are written for people; pass them on.
  if (error?.code === '22023' && typeof error.message === 'string' && error.message.length < 160) throw new Error(error.message);
  throw new Error(MESSAGES[error?.code] ?? fallback);
}

export async function loadOwners(orgId: string): Promise<OwnersData> {
  const [e, s, n, a] = await Promise.all([
    supabase.from('entities').select('*').eq('org_id', orgId).order('name'),
    supabase.from('listing_shares').select('property_id, entity_id, effective_from, share').eq('org_id', orgId),
    supabase.from('representative_nominations').select('id, property_id, nominee_user_id, status, nominated_at, approved_at').eq('org_id', orgId),
    supabase.from('representative_approvals').select('nomination_id, entity_id, share_at_approval, evidence_document_id, note, recorded_at').eq('org_id', orgId),
  ]);
  for (const r of [e, s, n, a]) if (r.error) fail(r.error, 'Could not load owners.');
  return {
    entities: (e.data ?? []) as Entity[],
    shares: (s.data ?? []).map((x: any) => ({ ...x, share: Number(x.share) })),
    nominations: (n.data ?? []) as Nomination[],
    approvals: (a.data ?? []).map((x: any) => ({ ...x, share_at_approval: Number(x.share_at_approval) })),
  };
}

export type EntityInput = Pick<Entity, 'name' | 'kind' | 'legal_form' | 'tax_country' | 'tax_id' | 'reporting_currency' | 'report_email' | 'report_frequency' | 'notes'>;

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export async function saveEntity(orgId: string, input: EntityInput, id?: string): Promise<void> {
  const row = {
    name: input.name.trim(),
    kind: input.kind,
    legal_form: clean(input.legal_form),
    tax_country: clean(input.tax_country),
    tax_id: clean(input.tax_id),
    reporting_currency: input.reporting_currency,
    report_email: clean(input.report_email)?.toLowerCase() ?? null,
    report_frequency: input.report_frequency,
    notes: clean(input.notes),
  };
  const res = id
    ? await supabase.from('entities').update(row).eq('org_id', orgId).eq('id', id).select('id')
    : await supabase.from('entities').insert({ org_id: orgId, ...row }).select('id');
  if (res.error) fail(res.error, 'Could not save the owner.');
  if (!res.data?.length) throw new Error('Could not save the owner. The workspace may be read-only.');
}

export async function deleteEntity(orgId: string, id: string): Promise<void> {
  const { error } = await supabase.from('entities').delete().eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not remove the owner.');
}

/** Stores an owner's letter or saved email (PDF or text) with the finance files. */
export async function uploadOwnerLetter(orgId: string, file: File): Promise<SourceDocument> {
  return (await uploadDocument(orgId, file, 'owner_letter')).doc;
}

/** Records that an owner asked to stop receiving reports, with the evidence. */
export async function optOutOfReports(orgId: string, id: string, evidence: { documentId?: string | null; note?: string | null }) {
  const note = clean(evidence.note);
  if (!evidence.documentId && !note) throw new Error('Attach the owner\'s letter or paste their email.');
  const { data, error } = await supabase.from('entities')
    .update({ reports_opted_out_at: new Date().toISOString(), opt_out_document_id: evidence.documentId ?? null, opt_out_note: note })
    .eq('org_id', orgId).eq('id', id).select('id');
  if (error) fail(error, 'Could not record the opt-out.');
  if (!data?.length) throw new Error('Could not record the opt-out. The workspace may be read-only.');
}

/** Reports start again (the owner asked for them back). */
export async function optBackIn(orgId: string, id: string) {
  const { error } = await supabase.from('entities')
    .update({ reports_opted_out_at: null, opt_out_document_id: null, opt_out_note: null })
    .eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not restart reports.');
}

export async function setShares(orgId: string, propertyId: string, effectiveFrom: string, shares: { entity_id: string; share: number }[]) {
  const { error } = await supabase.rpc('set_listing_shares', {
    p_org: orgId, p_property: propertyId, p_effective_from: effectiveFrom, p_shares: shares,
  });
  if (error) fail(error, 'Could not save the ownership.');
}

export async function nominateRepresentative(orgId: string, propertyId: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('nominate_representative', { p_org: orgId, p_property: propertyId, p_user: userId });
  if (error) fail(error, 'Could not nominate the representative.');
  return data as string;
}

export async function recordApproval(orgId: string, nominationId: string, entityId: string, evidence: { documentId?: string | null; note?: string | null }) {
  const { data, error } = await supabase.rpc('record_representative_approval', {
    p_org: orgId, p_nomination: nominationId, p_entity: entityId,
    p_evidence: evidence.documentId ?? null, p_note: clean(evidence.note),
  });
  if (error) fail(error, 'Could not record the approval.');
  return data as 'approved' | 'pending';
}

/* ---------- owner logins and prepared statements ---------- */

export interface OwnerInvite { id: string; entity_id: string; email: string; token: string; expires_at: string; accepted_at: string | null; created_at: string }
export interface OwnerLogin { entity_id: string; user_id: string; created_at: string }
export interface PreparedStatement {
  id: string; entity_id: string; kind: 'month_to_date' | 'monthly' | 'quarterly' | 'yearly';
  period_start: string; period_end: string; currency: string; total: number;
  statement: import('../lib/ownerStatement').Statement; prepared_at: string;
  email_status: 'sent' | 'failed' | 'opted_out' | 'no_email' | 'not_configured' | null; emailed_at: string | null;
}

export const ownerInviteLink = (token: string) => `${window.location.origin}/owner-invite/${token}`;

export async function loadOwnerAccess(orgId: string): Promise<{ invites: OwnerInvite[]; logins: OwnerLogin[] }> {
  const [i, l] = await Promise.all([
    supabase.from('owner_invitations').select('id, entity_id, email, token, expires_at, accepted_at, created_at').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('owner_logins').select('entity_id, user_id, created_at').eq('org_id', orgId),
  ]);
  if (i.error) fail(i.error, 'Could not load owner logins.');
  if (l.error) fail(l.error, 'Could not load owner logins.');
  return { invites: (i.data ?? []) as OwnerInvite[], logins: (l.data ?? []) as OwnerLogin[] };
}

export async function inviteOwner(orgId: string, entityId: string, email: string, userId: string): Promise<OwnerInvite> {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$/i.test(clean)) throw new Error('Enter a valid email address.');
  const { data, error } = await supabase.from('owner_invitations')
    .insert({ org_id: orgId, entity_id: entityId, email: clean, invited_by: userId })
    .select('id, entity_id, email, token, expires_at, accepted_at, created_at').single();
  if (error) fail(error, 'Could not create the invitation.');
  return data as OwnerInvite;
}

export async function cancelOwnerInvite(orgId: string, id: string) {
  const { error } = await supabase.from('owner_invitations').delete().eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not cancel the invitation.');
}

/** Ends every login to this owner's statements. */
export async function removeOwnerLogins(orgId: string, entityId: string) {
  const { error } = await supabase.from('owner_logins').delete().eq('org_id', orgId).eq('entity_id', entityId);
  if (error) fail(error, 'Could not remove the login.');
}

export async function loadPreparedStatements(orgId: string, entityId?: string): Promise<PreparedStatement[]> {
  let q = supabase.from('owner_statements')
    .select('id, entity_id, kind, period_start, period_end, currency, total, statement, prepared_at, email_status, emailed_at')
    .eq('org_id', orgId).order('period_start', { ascending: false }).limit(200);
  if (entityId) q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) fail(error, 'Could not load statements.');
  return (data ?? []).map((s: any) => ({ ...s, total: Number(s.total) })) as PreparedStatement[];
}
