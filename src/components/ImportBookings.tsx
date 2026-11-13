/**
 * Import past bookings from OTA PDFs for one unit: upload, read, review, save.
 * Nothing is saved until the operator confirms the reviewed rows.
 */
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Sheet, fieldClass } from './ui/Sheet';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { convert, formatMoney, isSupportedCurrency, type Rates } from '../lib/money';
import { fileProblem, markDocumentSaved, readStoredDocument, uploadDocument, type SourceDocument } from '../services/finance';
import type { Platform, Reservation, UserData } from '../types';

type FileState =
  | { name: string; state: 'uploading' | 'reading' }
  | { name: string; state: 'done'; found: number; skipped: number }
  | { name: string; state: 'failed'; error: string };

interface Row {
  key: string;
  include: boolean;
  documentId: string;
  fileName: string;
  platformId: string;
  reservation_code: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  guests: number | null;
  currency: string;   // as shown in the PDF
  gross: number;      // in the PDF's currency
  payout: number;     // in the PDF's currency
  originalGross: number | null; // unused
  status: 'confirmed' | 'cancelled';
  booking_date: string | null;
  payout_date: string | null;
  duplicate: boolean;
}

const KNOWN: Record<string, string[]> = { airbnb: ['airbnb'], booking: ['booking'], vrbo: ['vrbo', 'homeaway'], expedia: ['expedia'] };
function matchPlatform(detected: string, platforms: Platform[]): string {
  const keys = KNOWN[detected] ?? [];
  const hit = platforms.find(p => keys.some(k => `${p.platform_id} ${p.name}`.toLowerCase().includes(k)));
  return hit?.platform_id ?? '';
}

export const ImportBookings: React.FC<{
  open: boolean;
  onClose: () => void;
  orgId: string;
  data: UserData;
  setData: React.Dispatch<React.SetStateAction<UserData>>;
  canWrite: boolean;
  rates: Rates;
  baseCurrency: string;
}> = ({ open, onClose, orgId, data, setData, canWrite, rates, baseCurrency }) => {
  const [unitId, setUnitId] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [files, setFiles] = useState<FileState[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = files.some(f => f.state === 'uploading' || f.state === 'reading');
  const existing = useMemo(() => new Set(data.reservations.map(r => r.reservation_code)), [data.reservations]);

  const reset = () => { setFiles([]); setRows([]); setSaved(null); };
  const close = () => { if (!busy && !saving) { reset(); onClose(); } };

  const setFile = (i: number, f: FileState) => setFiles(list => list.map((x, k) => (k === i ? f : x)));

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length || !unitId) return;
    setSaved(null);
    const picked = Array.from(list).slice(0, 50);
    const offset = files.length;
    setFiles(prev => [...prev, ...picked.map(f => ({ name: f.name, state: 'uploading' as const }))]);
    // One at a time keeps within AI limits and shows steady progress.
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      const idx = offset + i;
      const problem = await fileProblem(file, false);
      if (problem) { setFile(idx, { name: file.name, state: 'failed', error: problem }); continue; }
      let doc: SourceDocument;
      try {
        const up = await uploadDocument(orgId, file, 'bookings', { apartmentId: unitId, platformId: platformId || null });
        doc = up.doc;
        if (up.duplicate && doc.status === 'saved') {
          setFile(idx, { name: file.name, state: 'failed', error: 'This exact file was already imported.' });
          continue;
        }
      } catch (err: any) {
        setFile(idx, { name: file.name, state: 'failed', error: err.message });
        continue;
      }
      setFile(idx, { name: file.name, state: 'reading' });
      try {
        const result = await readStoredDocument(orgId, doc);
        const detected = platformId || matchPlatform(result.platform, data.platforms);
        const found: Row[] = (result.rows || []).map((b: any, n: number) => {
          const currency = isSupportedCurrency(b.currency) ? b.currency : '';
          const num = (v: number | null) => (v === null ? 0 : Math.round(Number(v) * 100) / 100);
          return {
            key: `${doc.id}-${n}`,
            include: !existing.has(b.reservation_code),
            documentId: doc.id,
            fileName: file.name,
            platformId: detected,
            reservation_code: b.reservation_code,
            guest_name: b.guest_name,
            check_in: b.check_in,
            check_out: b.check_out,
            guests: b.guests,
            currency,
            gross: num(b.gross_amount),
            payout: num(b.host_payout),
            originalGross: null,
            status: b.status,
            booking_date: b.booking_date,
            payout_date: b.payout_date,
            duplicate: existing.has(b.reservation_code),
          };
        });
        setRows(prev => {
          const seen = new Set(prev.map(r => r.reservation_code));
          return [...prev, ...found.map(r => (seen.has(r.reservation_code) ? { ...r, include: false, duplicate: true } : r))];
        });
        setFile(idx, { name: file.name, state: 'done', found: found.length, skipped: result.skipped ?? 0 });
      } catch (err: any) {
        setFile(idx, { name: file.name, state: 'failed', error: err.message || 'Could not read this file.' });
      }
    }
    if (input.current) input.current.value = '';
  };

  // Bookings are saved in the chosen property's currency. A PDF in another currency is
  // converted at the rate on the check-in date and flagged for checking.
  const unitCurrency = data.apartments.find(a => a.apartment_id === unitId)?.currency || baseCurrency;
  const inUnit = (r: Row, v: number) => {
    if (!r.currency || r.currency === unitCurrency) return { value: v, converted: false, ok: true };
    const c = convert(v, r.currency, unitCurrency, r.check_in || new Date().toISOString().slice(0, 10), rates);
    return c === null ? { value: v, converted: false, ok: false } : { value: Math.round(c * 100) / 100, converted: true, ok: true };
  };
  const update = (key: string, patch: Partial<Row>) => setRows(list => list.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter(r => r.include && !r.duplicate);
  const missingPlatform = chosen.some(r => !r.platformId);

  const save = async () => {
    if (!chosen.length || missingPlatform) return;
    setSaving(true);
    const newOnes: Reservation[] = chosen.map(r => {
      const platform = data.platforms.find(p => p.platform_id === r.platformId);
      return {
        reservation_code: r.reservation_code,
        apartment_id: unitId,
        platform_id: r.platformId,
        channel: platform?.name ?? r.platformId,
        guest_name: r.guest_name || 'Guest',
        check_in: r.check_in,
        check_out: r.check_out,
        num_guests: r.guests ?? 1,
        nights: Math.max(1, differenceInCalendarDays(parseISO(r.check_out), parseISO(r.check_in))),
        total_booking_revenue: inUnit(r, r.gross).value,
        net_payout: inUnit(r, r.payout).value,
        currency: unitCurrency,
        payout_date: r.payout_date ?? undefined,
        cleaning_cost: 0,
        status: r.status,
        cancellation_policy: 'refundable',
        booking_date: r.booking_date ?? r.check_in,
        notes: `Imported from ${r.fileName}${inUnit(r, r.gross).converted ? ` (amounts converted from ${r.currency} ${r.gross} at the check-in date rate)` : ''}`,
        source_document_id: r.documentId,
      } as Reservation;
    });
    setData(prev => ({ ...prev, reservations: [...prev.reservations, ...newOnes] }));
    const perDoc = new Map<string, number>();
    newOnes.forEach(r => perDoc.set(r.source_document_id!, (perDoc.get(r.source_document_id!) ?? 0) + 1));
    await Promise.all([...perDoc].map(([id, n]) => markDocumentSaved(orgId, id, n).catch(() => undefined)));
    setRows(list => list.map(r => (r.include && !r.duplicate ? { ...r, include: false, duplicate: true } : r)));
    setSaved(newOnes.length);
    setSaving(false);
  };

  const totals = chosen.reduce((t, r) => ({ gross: t.gross + inUnit(r, r.gross).value, payout: t.payout + inUnit(r, r.payout).value }), { gross: 0, payout: 0 });

  return (
    <Sheet
      open={open}
      onClose={close}
      width="xl"
      title="Import bookings from PDFs"
      description="Booking confirmations or statements from Airbnb, Booking.com and other platforms. You review everything before it is saved."
      footer={rows.length > 0 && (
        <>
          <p className="mr-auto text-xs text-zinc-500">
            {chosen.length} {chosen.length === 1 ? 'booking' : 'bookings'} selected
            {chosen.length > 0 && `: guests paid ${formatMoney(totals.gross, unitCurrency)}, payouts ${formatMoney(totals.payout, unitCurrency)}`}
          </p>
          {missingPlatform && <p className="text-xs text-rose-600">Choose a platform for every selected booking.</p>}
          <Button onClick={save} disabled={!chosen.length || missingPlatform || saving || busy || !canWrite}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save {chosen.length || ''} {chosen.length === 1 ? 'booking' : 'bookings'}
          </Button>
        </>
      )}
    >
      {!canWrite ? (
        <p className="text-sm text-zinc-600">Your role can view bookings but not import them. Ask an owner or manager.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Unit</span>
              <select className={cn(fieldClass, 'mt-1.5')} value={unitId} onChange={e => setUnitId(e.target.value)} disabled={busy}>
                <option value="">Choose the unit these bookings are for</option>
                {data.apartments.map(a => <option key={a.apartment_id} value={a.apartment_id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Platform</span>
              <select className={cn(fieldClass, 'mt-1.5')} value={platformId} onChange={e => setPlatformId(e.target.value)} disabled={busy}>
                <option value="">Detect from each PDF</option>
                {data.platforms.map(p => <option key={p.platform_id} value={p.platform_id}>{p.name}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              <Button variant="outline" className="w-full" disabled={!unitId || busy} onClick={() => input.current?.click()}>
                <Upload size={15} /> Choose PDFs
              </Button>
            </div>
          </div>

          {!unitId && files.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Choose the unit first, then select one or many PDFs (up to 50 at a time, 20 MB each).
            </div>
          )}
          {unitId && files.length === 0 && (
            <button
              onClick={() => input.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              className="w-full rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 hover:border-emerald-400 hover:text-zinc-800 dark:border-zinc-700"
            >
              Drop PDFs here, or click to choose them
            </button>
          )}

          {files.length > 0 && (
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <FileText size={15} className="shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200">{f.name}</span>
                  {f.state === 'uploading' && <span className="flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Uploading</span>}
                  {f.state === 'reading' && <span className="flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 size={12} className="animate-spin" /> Reading</span>}
                  {f.state === 'done' && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <CheckCircle2 size={13} /> {f.found} {f.found === 1 ? 'booking' : 'bookings'} found{f.skipped ? `, ${f.skipped} unreadable` : ''}
                    </span>
                  )}
                  {f.state === 'failed' && <span className="flex items-center gap-1.5 text-xs text-rose-600"><AlertTriangle size={13} /> {f.error}</span>}
                </li>
              ))}
            </ul>
          )}

          {saved !== null && (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status">
              Saved {saved} {saved === 1 ? 'booking' : 'bookings'}. Each one is linked to its PDF. You can add more files, or close this panel.
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-850">
                  <tr>
                    <th className="w-8 px-3 py-2"><span className="sr-only">Include</span></th>
                    <th className="px-2 py-2 text-left font-medium">Code</th>
                    <th className="px-2 py-2 text-left font-medium">Guest</th>
                    <th className="px-2 py-2 text-left font-medium">Check-in</th>
                    <th className="px-2 py-2 text-left font-medium">Check-out</th>
                    <th className="px-2 py-2 text-left font-medium">Platform</th>
                    <th className="px-2 py-2 text-right font-medium">Guest paid</th>
                    <th className="px-2 py-2 text-right font-medium">Payout</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.key} className={cn('border-t border-zinc-100 dark:border-zinc-800', r.duplicate && 'opacity-55')}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Include ${r.reservation_code}`}
                          className="accent-emerald-600"
                          checked={r.include && !r.duplicate}
                          disabled={r.duplicate}
                          onChange={e => update(r.key, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.reservation_code}</span>
                        {r.duplicate && <span className="block text-[11px] text-zinc-500">Already saved</span>}
                        {!r.duplicate && inUnit(r, r.gross).converted && <span className="block text-[11px] text-amber-700">In {r.currency}; saved as {formatMoney(inUnit(r, r.gross).value, unitCurrency)}, check</span>}
                        {!r.duplicate && !inUnit(r, r.gross).ok && <span className="block text-[11px] text-rose-600">In {r.currency}; no rate yet, amounts not converted</span>}
                      </td>
                      <td className="px-2 py-1.5"><input className={cn(fieldClass, 'h-8 min-w-[130px]')} value={r.guest_name} onChange={e => update(r.key, { guest_name: e.target.value.slice(0, 200) })} /></td>
                      <td className="px-2 py-1.5"><input type="date" className={cn(fieldClass, 'h-8')} value={r.check_in} onChange={e => update(r.key, { check_in: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><input type="date" className={cn(fieldClass, 'h-8')} value={r.check_out} onChange={e => update(r.key, { check_out: e.target.value })} /></td>
                      <td className="px-2 py-1.5">
                        <select className={cn(fieldClass, 'h-8 min-w-[110px]', !r.platformId && r.include && 'border-rose-300')} value={r.platformId} onChange={e => update(r.key, { platformId: e.target.value })}>
                          <option value="">Choose</option>
                          {data.platforms.map(p => <option key={p.platform_id} value={p.platform_id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input type="number" min={0} step="0.01" className={cn(fieldClass, 'h-8 w-28 text-right')} value={r.gross} onChange={e => update(r.key, { gross: Math.max(0, Number(e.target.value) || 0) })} /><span className="block text-right text-[11px] text-zinc-500">{r.currency || unitCurrency}</span></td>
                      <td className="px-2 py-1.5"><input type="number" min={0} step="0.01" className={cn(fieldClass, 'h-8 w-28 text-right')} value={r.payout} onChange={e => update(r.key, { payout: Math.max(0, Number(e.target.value) || 0) })} /><span className="block text-right text-[11px] text-zinc-500">{r.currency || unitCurrency}</span></td>
                      <td className="px-2 py-1.5">
                        <select className={cn(fieldClass, 'h-8')} value={r.status} onChange={e => update(r.key, { status: e.target.value as Row['status'] })}>
                          <option value="confirmed">Confirmed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
};
