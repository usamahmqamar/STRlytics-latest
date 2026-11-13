/**
 * Your data: download everything as CSV files in one ZIP, and (owners) delete the workspace
 * with a 30-day hold that can be cancelled.
 */
import React, { useState } from 'react';
import Papa from 'papaparse';
import { strToU8, zipSync } from 'fflate';
import { addDays, format, parseISO } from 'date-fns';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { fieldClass } from './ui/Sheet';
import { cn } from '../lib/utils';
import { safeUnparseOptions } from '../lib/csv';
import { supabase } from '../lib/supabase';
import { rowsFor } from '../services/dataStore';
import { listDocuments, loadFinance } from '../services/finance';
import { listScenarios } from '../services/scenarios';
import { useAuth, type Workspace } from '../auth/AuthProvider';
import { canManage } from '../lib/permissions';
import type { UserData } from '../types';

const toCsv = (rows: Record<string, any>[]) => {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => c !== 'org_id');
  const flat = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] !== null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]])));
  return Papa.unparse(flat, { ...safeUnparseOptions, columns: cols });
};

export async function buildExport(data: UserData, ws: Workspace): Promise<{ zip: Uint8Array; files: string[] }> {
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, rows: Record<string, any>[]) => {
    if (rows.length) files[name] = strToU8(toCsv(rows));
  };
  for (const [table, rows] of rowsFor(data, ws.id)) add(`${table}.csv`, [...rows.values()]);
  const scenarios = await listScenarios(ws.id).catch(() => []);
  add('feasibility_scenarios.csv', scenarios.map(s => ({ name: s.name, created_at: s.created_at, converted_property: s.converted_apartment_id, inputs: s.inputs })));
  if (canManage(ws) || ws.deletion_requested_at) {
    const fin = await loadFinance(ws.id).catch(() => null);
    if (fin) {
      add('payouts.csv', fin.payouts as any[]);
      add('payout_matches.csv', fin.allocations as any[]);
      add('payout_differences.csv', fin.adjustments as any[]);
    }
  }
  const docs = await listDocuments(ws.id).catch(() => []);
  add('uploaded_documents.csv', docs.map(d => ({ file_name: d.file_name, kind: d.kind, property: d.apartment_id, uploaded: d.created_at, status: d.status, rows_saved: d.rows_saved })));

  const names = Object.keys(files).sort();
  files['README.txt'] = strToU8([
    `Staylytics export for ${ws.name}`,
    `Created ${format(new Date(), 'd MMM yyyy, HH:mm')}`,
    '',
    'One CSV file per table, readable in Excel, Numbers or Google Sheets. Each amount is in the currency shown in its row\'s currency column (properties: their own currency).',
    'Cells that start with = + - or @ are prefixed with an apostrophe so spreadsheets do not run them as formulas.',
    'Uploaded PDFs are listed in uploaded_documents.csv; open them from Payouts and bank > Documents.',
    '',
    'Files:',
    ...names.map(n => `  ${n}`),
  ].join('\n'));
  return { zip: zipSync(files, { level: 6 }), files: names };
}

export const YourData: React.FC<{ data: UserData; workspace: Workspace }> = ({ data, workspace }) => {
  const { refreshWorkspaces } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isOwner = workspace.role === 'owner';
  const pending = workspace.deletion_requested_at;

  const download = async () => {
    setExporting(true); setMsg(null);
    try {
      const { zip, files } = await buildExport(data, workspace);
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `staylytics-${workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMsg({ ok: true, text: `Downloaded ${files.length} files.` });
    } catch {
      setMsg({ ok: false, text: 'Could not build the export. Please try again.' });
    } finally { setExporting(false); }
  };

  const call = async (fn: 'request_workspace_deletion' | 'cancel_workspace_deletion') => {
    setBusy(true); setMsg(null);
    const args = fn === 'request_workspace_deletion' ? { p_org: workspace.id, p_confirm_name: confirm } : { p_org: workspace.id };
    const { error } = await supabase.rpc(fn, args);
    if (error) {
      setMsg({ ok: false, text: error.code === '22023' ? 'The name you typed does not match the workspace name.' : 'Only an owner can do this.' });
    } else {
      setConfirm('');
      await refreshWorkspaces();
      setMsg({ ok: true, text: fn === 'request_workspace_deletion' ? 'Deletion scheduled. The workspace is now read-only.' : 'Deletion cancelled. You can make changes again.' });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <Card title="Download all your data">
        <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          One ZIP file with a spreadsheet for each part of your workspace: properties, leases and rent cheques, bookings, costs,
          vendors, saved feasibility units{canManage(workspace) ? ', payouts and their matches' : ''}. You can take it anywhere.
        </p>
        <Button className="mt-4" onClick={download} disabled={exporting}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {exporting ? 'Preparing…' : 'Download ZIP'}
        </Button>
      </Card>

      {isOwner && (
        <Card title="Delete this workspace">
          {pending ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Deletion was requested on {format(parseISO(pending), 'd MMM yyyy')}. The workspace is read-only, and everything in it
                will be removed on <span className="font-semibold">{format(addDays(parseISO(pending), 30), 'd MMM yyyy')}</span>.
                Download your data before then if you need it.
              </p>
              <Button variant="outline" onClick={() => call('cancel_workspace_deletion')} disabled={busy}>Cancel deletion</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
                The workspace becomes read-only straight away and is removed after 30 days, with all properties, bookings,
                payouts and files. Any owner can cancel during those 30 days. Your team loses access when it is removed.
              </p>
              <label className="block max-w-sm text-xs text-zinc-600 dark:text-zinc-400">
                Type <span className="font-semibold text-zinc-900 dark:text-zinc-100">{workspace.name}</span> to confirm
                <input className={cn(fieldClass, 'mt-1')} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
              </label>
              <Button variant="danger" onClick={() => call('request_workspace_deletion')} disabled={busy || confirm.trim() !== workspace.name}>
                <Trash2 size={14} /> Delete workspace
              </Button>
            </div>
          )}
        </Card>
      )}
      {msg && <p className={cn('text-sm', msg.ok ? 'text-emerald-700' : 'text-rose-600')} role="status">{msg.text}</p>}
    </div>
  );
};
