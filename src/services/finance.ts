/**
 * Documents, payouts, payout matches and explained differences.
 * Reads and writes go straight to Supabase as the signed-in user; row-level security decides
 * what each role may see or change (finance is owners and managers only).
 */
import { supabase } from '../lib/supabase';
import { readDocument } from './ai';
import type { Adjustment, Allocation, Payout } from '../lib/reconcile';

export const BUCKET = 'workspace-files';
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export type DocumentKind = 'bookings' | 'bank_statement' | 'payout_report';

export interface SourceDocument {
  id: string;
  kind: DocumentKind;
  apartment_id: string | null;
  platform_id: string | null;
  file_path: string;
  file_name: string;
  file_size: number | null;
  status: 'uploaded' | 'read' | 'saved' | 'failed';
  rows_found: number | null;
  rows_saved: number | null;
  error: string | null;
  created_at: string;
}

const fail = (error: any, fallback: string): never => {
  console.error(fallback, error?.code || error?.message || error);
  throw new Error(error?.code === '42501' ? 'Your role cannot do this.' : fallback);
};

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Checks what a file really is before uploading (not just its name). */
export async function fileProblem(file: File, allowCsv: boolean): Promise<string | null> {
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Files must be 20 MB or smaller.';
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdf = String.fromCharCode(...head) === '%PDF-';
  if (isPdf) return null;
  if (allowCsv && /\.(csv|txt)$/i.test(file.name)) {
    const sample = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    return sample.includes(0) ? 'This does not look like a CSV file.' : null;
  }
  return allowCsv ? 'Upload a PDF or CSV file.' : 'Upload a PDF file.';
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._ -]/g, '_').slice(-120) || 'document.pdf';

/**
 * Uploads a file to the workspace's private storage and records it.
 * The same file uploaded twice returns the existing record instead of a copy.
 */
export async function uploadDocument(
  orgId: string, file: File, kind: DocumentKind, opts: { apartmentId?: string | null; platformId?: string | null } = {},
): Promise<{ doc: SourceDocument; duplicate: boolean }> {
  const hash = await sha256(file);
  const existing = await supabase.from('source_documents').select('*').eq('org_id', orgId).eq('sha256', hash).maybeSingle();
  if (existing.data) return { doc: existing.data as SourceDocument, duplicate: true };

  const area = kind === 'bookings' ? 'bookings' : 'finance';
  const path = `${orgId}/${area}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: isPdf ? 'application/pdf' : 'text/csv', upsert: false,
  });
  if (up.error) fail(up.error, 'Could not upload the file. Please try again.');

  const ins = await supabase.from('source_documents').insert({
    org_id: orgId, kind, file_path: path, file_name: safeName(file.name), file_size: file.size, sha256: hash,
    apartment_id: opts.apartmentId ?? null, platform_id: opts.platformId ?? null,
  }).select('*').single();
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    fail(ins.error, 'Could not record the file. Please try again.');
  }
  return { doc: ins.data as SourceDocument, duplicate: false };
}

/** Reads a stored document on the server and records the outcome on the document. */
export async function readStoredDocument(orgId: string, doc: SourceDocument) {
  try {
    const result = await readDocument(doc.id);
    await supabase.from('source_documents').update({ status: 'read', rows_found: result.rows?.length ?? 0, error: null })
      .eq('org_id', orgId).eq('id', doc.id);
    return result;
  } catch (err: any) {
    await supabase.from('source_documents').update({ status: 'failed', error: String(err?.message || 'Could not read').slice(0, 500) })
      .eq('org_id', orgId).eq('id', doc.id);
    throw err;
  }
}

export async function markDocumentSaved(orgId: string, id: string, rowsSaved: number) {
  await supabase.from('source_documents').update({ status: 'saved', rows_saved: rowsSaved }).eq('org_id', orgId).eq('id', id);
}

/** Opens a stored file in a new tab through a short-lived private link. */
export async function openDocument(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) fail(error, 'Could not open the file.');
  window.open(data!.signedUrl, '_blank', 'noopener,noreferrer');
}

export async function listDocuments(orgId: string): Promise<SourceDocument[]> {
  const { data, error } = await supabase.from('source_documents').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(500);
  if (error) fail(error, 'Could not load documents.');
  return (data || []) as SourceDocument[];
}

/* ---------- payouts ---------- */

export interface FinanceData {
  payouts: Payout[];
  allocations: (Allocation & { id: string })[];
  adjustments: (Adjustment & { id: string; created_at: string })[];
}

async function all<T>(table: string, orgId: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').eq('org_id', orgId).order(order).range(from, from + 999);
    if (error) fail(error, 'Could not load payouts.');
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function loadFinance(orgId: string): Promise<FinanceData> {
  const [payouts, allocations, adjustments] = await Promise.all([
    all<Payout>('payouts', orgId, 'received_date'),
    all<Allocation & { id: string }>('payout_allocations', orgId, 'created_at'),
    all<Adjustment & { id: string; created_at: string }>('payout_adjustments', orgId, 'created_at'),
  ]);
  return { payouts: payouts.map(p => ({ ...p, amount_aed: Number(p.amount_aed) })),
    allocations: allocations.map(a => ({ ...a, amount_aed: Number(a.amount_aed) })),
    adjustments: adjustments.map(a => ({ ...a, amount_aed: Number(a.amount_aed) })) };
}

export interface NewPayout {
  platform_id: string | null;
  received_date: string;
  amount_aed: number;
  original_amount?: number | null;
  original_currency?: string | null;
  reference?: string | null;
  description?: string | null;
  notes?: string | null;
  source: Payout['source'];
  source_document_id?: string | null;
}

/** Adds payouts one by one so a duplicate (same date, amount and reference) is skipped, not fatal. */
export async function addPayouts(orgId: string, rows: NewPayout[]): Promise<{ added: Payout[]; duplicates: number }> {
  const added: Payout[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const { data, error } = await supabase.from('payouts').insert({ org_id: orgId, ...r }).select('*').single();
    if (error?.code === '23505') { duplicates++; continue; }
    if (error) fail(error, 'Could not save the payout.');
    added.push({ ...(data as Payout), amount_aed: Number((data as Payout).amount_aed) });
  }
  return { added, duplicates };
}

export async function deletePayout(orgId: string, id: string) {
  const { error } = await supabase.from('payouts').delete().eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not delete the payout.');
}

export async function addAllocations(orgId: string, payoutId: string, rows: { reservation_id: string; amount_aed: number }[]) {
  if (!rows.length) return;
  const { error } = await supabase.from('payout_allocations').insert(rows.map(r => ({ org_id: orgId, payout_id: payoutId, ...r })));
  if (error) fail(error, error.code === '23514' ? 'Those matches add up to more than the payout.' : 'Could not save the match.');
}

export async function removeAllocation(orgId: string, id: string) {
  const { error } = await supabase.from('payout_allocations').delete().eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not remove the match.');
}

export async function addAdjustment(orgId: string, adj: Omit<Adjustment, 'id'>) {
  const { error } = await supabase.from('payout_adjustments').insert({ org_id: orgId, ...adj });
  if (error) fail(error, 'Could not save the explanation.');
}

export async function updateAdjustment(orgId: string, id: string, patch: Partial<Adjustment> & { resolved_at?: string | null }) {
  const { error } = await supabase.from('payout_adjustments').update(patch).eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not update the explanation.');
}

export async function deleteAdjustment(orgId: string, id: string) {
  const { error } = await supabase.from('payout_adjustments').delete().eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not remove the explanation.');
}
