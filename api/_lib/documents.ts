/**
 * Reading uploaded documents (OTA booking PDFs, bank statements, payout reports).
 *
 * The file is fetched from Supabase Storage with the caller's own token, so row-level
 * security decides whether they may read it; the server holds no storage secret.
 * Everything the AI returns is treated as untrusted data and cleaned here before use.
 */
import { HttpError, UUID, supabaseConfig, type Caller } from './security.js';

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ROWS = 500;

export type DocumentKind = 'bookings' | 'bank_statement' | 'payout_report';

export interface LoadedDocument {
  kind: DocumentKind;
  platformId: string | null;
  mime: 'application/pdf' | 'text/csv';
  bytes: Buffer;
}

/** Loads the document record and its file as the caller. */
export async function loadDocument(caller: Caller, documentId: unknown): Promise<LoadedDocument> {
  if (typeof documentId !== 'string' || !UUID.test(documentId)) throw new HttpError(400, 'Document missing.');
  const { url, key } = supabaseConfig();
  const headers = { apikey: key, authorization: `Bearer ${caller.token}` };

  let row: any;
  try {
    const res = await fetch(
      `${url}/rest/v1/source_documents?org_id=eq.${caller.workspaceId}&id=eq.${documentId}&select=kind,file_path,platform_id,file_size`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(String(res.status));
    row = (await res.json())?.[0];
  } catch {
    throw new HttpError(503, 'Could not open the document. Please try again.');
  }
  if (!row) throw new HttpError(404, 'Document not found.');
  if (!['bookings', 'bank_statement', 'payout_report'].includes(row.kind)) throw new HttpError(400, 'Unsupported document.');
  if (typeof row.file_path !== 'string' || !row.file_path.startsWith(`${caller.workspaceId}/`) || row.file_path.includes('..')) {
    throw new HttpError(400, 'Unsupported document.');
  }
  if (Number(row.file_size) > MAX_DOCUMENT_BYTES) throw new HttpError(413, 'This file is larger than 15 MB. Split it into smaller files.');

  let bytes: Buffer;
  try {
    const path = row.file_path.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(`${url}/storage/v1/object/authenticated/workspace-files/${path}`, {
      headers, signal: AbortSignal.timeout(20000),
    });
    if (res.status === 400 || res.status === 404) throw new HttpError(404, 'File not found.');
    if (!res.ok) throw new Error(String(res.status));
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > MAX_DOCUMENT_BYTES) throw new HttpError(413, 'This file is larger than 15 MB. Split it into smaller files.');
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, 'Could not open the document. Please try again.');
  }
  if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES) throw new HttpError(413, 'This file is empty or larger than 15 MB.');
  return { kind: row.kind, platformId: typeof row.platform_id === 'string' ? row.platform_id : null, mime: detectType(bytes), bytes };
}

/** PDF by signature; otherwise plain text (CSV) without binary bytes. Anything else is refused. */
export function detectType(bytes: Buffer): 'application/pdf' | 'text/csv' {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  const sample = bytes.subarray(0, 4096);
  if (sample.includes(0)) throw new HttpError(415, 'Upload a PDF or CSV file.');
  return 'text/csv';
}

/* ---------- cleaning AI output ---------- */

const clip = (v: unknown, n: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';

export function cleanDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  const year = d.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? v : null;
}

export function cleanMoney(v: unknown): number | null {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /\d/.test(v)) n = Number(v.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || Math.abs(n) >= 1e9) return null;
  return Math.round(n * 100) / 100;
}

const cleanCurrency = (v: unknown) => (typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim().toUpperCase()) ? v.trim().toUpperCase() : 'AED');

export function cleanPlatform(v: unknown): string {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking')) return 'booking';
  if (s.includes('vrbo') || s.includes('homeaway')) return 'vrbo';
  if (s.includes('expedia')) return 'expedia';
  if (s.includes('direct') || s.includes('stripe') || s.includes('paypal')) return 'direct';
  return 'other';
}

export interface ExtractedBooking {
  reservation_code: string;
  guest_name: string;
  listing_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number | null;
  gross_amount: number | null;
  host_payout: number | null;
  commission: number | null;
  vat: number | null;
  payment_fee: number | null;
  cleaning_fee: number | null;
  currency: string;
  status: 'confirmed' | 'cancelled';
  booking_date: string | null;
  payout_date: string | null;
}

export function cleanBookings(raw: any): { platform: string; rows: ExtractedBooking[]; skipped: number } {
  const list = Array.isArray(raw?.bookings) ? raw.bookings : [];
  const rows: ExtractedBooking[] = [];
  let skipped = 0;
  for (const b of list.slice(0, MAX_ROWS)) {
    const code = clip(b?.reservation_code, 64).replace(/[^A-Za-z0-9_\-./#]/g, '');
    const checkIn = cleanDate(b?.check_in);
    const checkOut = cleanDate(b?.check_out);
    if (!code || !checkIn || !checkOut || checkOut <= checkIn) { skipped++; continue; }
    const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
    if (nights < 1 || nights > 365) { skipped++; continue; }
    const guests = Number(b?.guests);
    rows.push({
      reservation_code: code,
      guest_name: clip(b?.guest_name, 200),
      listing_name: clip(b?.listing_name, 200),
      check_in: checkIn,
      check_out: checkOut,
      nights,
      guests: Number.isInteger(guests) && guests > 0 && guests < 100 ? guests : null,
      gross_amount: cleanMoney(b?.gross_amount),
      host_payout: cleanMoney(b?.host_payout),
      commission: cleanMoney(b?.commission),
      vat: cleanMoney(b?.vat),
      payment_fee: cleanMoney(b?.payment_fee),
      cleaning_fee: cleanMoney(b?.cleaning_fee),
      currency: cleanCurrency(b?.currency),
      status: /cancel/i.test(String(b?.status ?? '')) ? 'cancelled' : 'confirmed',
      booking_date: cleanDate(b?.booking_date),
      payout_date: cleanDate(b?.payout_date),
    });
  }
  skipped += Math.max(0, list.length - MAX_ROWS);
  return { platform: cleanPlatform(raw?.platform), rows, skipped };
}

export interface ExtractedTransaction {
  date: string;
  amount: number;
  currency: string;
  description: string;
  reference: string;
  platform: string;
}

/** Bank statements: money received only (credits). */
export function cleanBankStatement(raw: any): { rows: ExtractedTransaction[]; skipped: number } {
  const list = Array.isArray(raw?.transactions) ? raw.transactions : [];
  const rows: ExtractedTransaction[] = [];
  let skipped = 0;
  for (const t of list.slice(0, MAX_ROWS)) {
    const date = cleanDate(t?.date);
    const amount = cleanMoney(t?.amount);
    if (!date || amount === null || amount <= 0) { skipped++; continue; }
    const description = clip(t?.description, 500);
    rows.push({
      date, amount, currency: cleanCurrency(t?.currency), description,
      reference: clip(t?.reference, 200),
      platform: cleanPlatform(`${t?.platform ?? ''} ${description}`),
    });
  }
  return { rows, skipped: skipped + Math.max(0, list.length - MAX_ROWS) };
}

export interface ExtractedPayout {
  date: string;
  amount: number;
  currency: string;
  reference: string;
  items: { reservation_code: string; guest_name: string; amount: number | null }[];
}

export function cleanPayoutReport(raw: any): { platform: string; rows: ExtractedPayout[]; skipped: number } {
  const list = Array.isArray(raw?.payouts) ? raw.payouts : [];
  const rows: ExtractedPayout[] = [];
  let skipped = 0;
  for (const p of list.slice(0, MAX_ROWS)) {
    const date = cleanDate(p?.date);
    const amount = cleanMoney(p?.amount);
    if (!date || amount === null || amount === 0) { skipped++; continue; }
    const items = (Array.isArray(p?.items) ? p.items : []).slice(0, 200)
      .map((it: any) => ({
        reservation_code: clip(it?.reservation_code, 64).replace(/[^A-Za-z0-9_\-./#]/g, ''),
        guest_name: clip(it?.guest_name, 200),
        amount: cleanMoney(it?.amount),
      }))
      .filter((it: any) => it.reservation_code);
    rows.push({ date, amount, currency: cleanCurrency(p?.currency), reference: clip(p?.reference, 200), items });
  }
  return { platform: cleanPlatform(raw?.platform), rows, skipped: skipped + Math.max(0, list.length - MAX_ROWS) };
}
