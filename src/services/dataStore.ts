/**
 * Loads a workspace's data from Supabase tables into the app's UserData shape, and saves
 * changes back as row-level inserts, updates and deletes (only rows that changed).
 *
 * Security lives in the database (row-level security). This layer only skips writes the
 * current role is not allowed to make, so the user gets a clear message instead of an error.
 */
import { supabase } from '../lib/supabase';
import type { Workspace } from '../auth/AuthProvider';
import { canEdit, canManage } from '../lib/permissions';
import type { UserData } from '../types';
import { DEFAULT_USER_DATA } from '../constants';

import {
  TABLES, PROPERTY_COLS, CHEQUE_COLS, SETUP_COLS, toCell, pick, unpick, assembleUserData, type Row, type TableDef,
} from '../lib/workspaceRows';
export { toDate } from '../lib/workspaceRows';

// ---------- snapshot: the rows that represent a UserData state ----------
export type Snapshot = Map<string, Map<string, Row>>; // table -> key -> row

export function rowsFor(data: UserData, orgId: string): Snapshot {
  const snap: Snapshot = new Map();
  const put = (table: string, key: string, row: Row) => {
    if (!snap.has(table)) snap.set(table, new Map());
    snap.get(table)!.set(key, row);
  };
  for (const t of ['properties', 'property_rent_cheques', 'property_setup_costs', ...TABLES.map(d => d.table)]) snap.set(t, new Map());

  for (const apt of data.apartments || []) {
    const id = String(apt.apartment_id || '').trim();
    if (!id) continue;
    put('properties', id, {
      org_id: orgId, id,
      ...pick(apt, PROPERTY_COLS, ['start_operation_date', 'tenancy_end_date'], ['num_cheques']),
    });
    for (const c of apt.rent_cheques || []) {
      if (!c?.cheque_id) continue;
      put('property_rent_cheques', `${id}::${c.cheque_id}`, { org_id: orgId, property_id: id, id: c.cheque_id, ...pick(c, CHEQUE_COLS, ['due_date']) });
    }
    for (const s of apt.setup_costs || []) {
      if (!s?.item_id) continue;
      put('property_setup_costs', `${id}::${s.item_id}`, { org_id: orgId, property_id: id, id: s.item_id, ...pick(s, SETUP_COLS, ['date']) });
    }
  }

  for (const def of TABLES) {
    for (const item of ((data[def.collection] as any[]) || [])) {
      const id = String(item?.[def.idField] ?? '').trim();
      if (!id) continue;
      put(def.table, id, { org_id: orgId, id, ...pick(item, def.cols, def.dates, def.ints) });
    }
  }

  put('workspace_settings', orgId, {
    org_id: orgId,
    company_profile: data.companyProfile || {},
    custom_document_types: data.customDocumentTypes || [],
  });
  put('user_preferences', 'me', {
    prefs: { dashboardWidgets: data.dashboardWidgets || [], displaySettings: data.displaySettings || null, emailReminders: data.emailReminders !== false },
  });
  return snap;
}

// ---------- loading ----------
async function fetchAll(table: string, orgId: string): Promise<Row[]> {
  const pageSize = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select('*').eq('org_id', orgId).range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < pageSize) return out;
  }
}

/** When each saved row last changed (table -> key -> updated_at), used to refuse stale writes. */
export type Versions = Map<string, Map<string, string>>;

export interface LoadedWorkspace {
  data: UserData;
  snapshot: Snapshot;
  versions: Versions;
}

const rowKey = (table: string, r: Row) =>
  table === 'property_rent_cheques' || table === 'property_setup_costs' ? `${r.property_id}::${r.id}` : String(r.id);

export async function loadWorkspaceData(ws: Workspace, userId: string): Promise<LoadedWorkspace> {
  const [props, cheques, setup, settings, prefs, ...lists] = await Promise.all([
    fetchAll('properties', ws.id),
    fetchAll('property_rent_cheques', ws.id),
    fetchAll('property_setup_costs', ws.id),
    supabase.from('workspace_settings').select('*').eq('org_id', ws.id).maybeSingle(),
    supabase.from('user_preferences').select('prefs').eq('org_id', ws.id).eq('user_id', userId).maybeSingle(),
    ...TABLES.map(d => fetchAll(d.table, ws.id)),
  ]);
  if (settings.error) throw settings.error;
  if (prefs.error) throw prefs.error;

  const base = assembleUserData({
    properties: props, property_rent_cheques: cheques, property_setup_costs: setup,
    tables: Object.fromEntries(TABLES.map((d, i) => [d.table, lists[i] as Row[]])),
  });
  const data: any = {
    ...base,
    companyProfile: (settings.data?.company_profile as any) || { name: ws.name },
    customDocumentTypes: settings.data?.custom_document_types || [],
    dashboardWidgets: (prefs.data?.prefs as any)?.dashboardWidgets?.length
      ? (prefs.data!.prefs as any).dashboardWidgets
      : DEFAULT_USER_DATA.dashboardWidgets,
    displaySettings: (prefs.data?.prefs as any)?.displaySettings || DEFAULT_USER_DATA.displaySettings,
    emailReminders: (prefs.data?.prefs as any)?.emailReminders !== false,
    // Billing state is owned by the server; shown read-only from the workspace.
    subscription: { plan: ws.status, monthly_payment: 0, next_charge_date: ws.trial_ends_at || '', card_details: { last4: '', brand: '', expiry: '' }, status: ws.status },
    paymentHistory: [],
  };

  const loaded = data as UserData;
  const versions: Versions = new Map();
  const remember = (table: string, rows: Row[]) =>
    versions.set(table, new Map(rows.filter(r => r.updated_at).map(r => [rowKey(table, r), String(r.updated_at)])));
  remember('properties', props);
  remember('property_rent_cheques', cheques);
  remember('property_setup_costs', setup);
  TABLES.forEach((def, i) => remember(def.table, lists[i] as Row[]));
  if (settings.data?.updated_at) versions.set('workspace_settings', new Map([[ws.id, String(settings.data.updated_at)]]));
  return { data: loaded, snapshot: rowsFor(loaded, ws.id), versions };
}

// ---------- saving ----------
const ORDER = ['properties', 'property_rent_cheques', 'property_setup_costs', ...TABLES.map(d => d.table), 'workspace_settings', 'user_preferences'];
const MANAGER_ONLY = new Set(['properties', 'property_rent_cheques', 'property_setup_costs', 'workspace_settings',
  ...TABLES.filter(d => !d.staffCanWrite).map(d => d.table)]);
const CONFLICT: Record<string, string> = {
  property_rent_cheques: 'org_id,property_id,id',
  property_setup_costs: 'org_id,property_id,id',
  workspace_settings: 'org_id',
  user_preferences: 'user_id,org_id',
};

export interface Conflict { table: string; key: string }

export interface SaveResult {
  snapshot: Snapshot;      // what is now confirmed saved
  versions: Versions;      // updated_at of confirmed rows
  failed: string[];        // tables that failed
  blocked: string[];       // tables the role may not change
  conflicts: Conflict[];   // rows someone else changed first; not overwritten
  changed: boolean;
}

const same = (a?: Row, b?: Row) => JSON.stringify(a) === JSON.stringify(b);

/** Rows to upsert and keys to delete for one table between two snapshots. */
export function diffTable(before: Map<string, Row> = new Map(), after: Map<string, Row> = new Map()) {
  return {
    upserts: [...after].filter(([k, r]) => !same(before.get(k), r)),
    deletes: [...before.keys()].filter(k => !after.has(k)),
  };
}

/** Runs tasks with limited parallelism. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Saves only what changed since the last confirmed snapshot, one record at a time.
 * Updates and deletes include the record's last-changed time, so if a teammate changed the
 * record in the meantime the write matches nothing: their version is kept and the record is
 * reported as a conflict instead of being overwritten.
 */
export async function saveChanges(
  ws: Workspace, userId: string, previous: Snapshot, data: UserData, versions: Versions = new Map(),
  db: { from: (table: string) => any } = supabase,
): Promise<SaveResult> {
  const next = rowsFor(data, ws.id);
  const confirmed: Snapshot = new Map([...previous].map(([t, m]) => [t, new Map(m)]));
  const vers: Versions = new Map([...versions].map(([t, m]) => [t, new Map(m)]));
  const failed: string[] = [];
  const blocked: string[] = [];
  const conflicts: Conflict[] = [];
  let changed = false;

  for (const table of ORDER) {
    const before = previous.get(table) || new Map();
    const after = next.get(table) || new Map();
    const { upserts, deletes } = diffTable(before, after);
    if (!upserts.length && !deletes.length) continue;
    changed = true;

    const allowed = table === 'user_preferences' ||
      (MANAGER_ONLY.has(table) ? canManage(ws) : canEdit(ws));
    if (!allowed) {
      blocked.push(table);
      continue;
    }
    if (!confirmed.has(table)) confirmed.set(table, new Map());
    if (!vers.has(table)) vers.set(table, new Map());
    const done = confirmed.get(table)!;
    const v = vers.get(table)!;
    const nested = table === 'property_rent_cheques' || table === 'property_setup_costs';
    const scope = (q: any, r: Row) => {
      q = q.eq('org_id', ws.id).eq('id', r.id);
      return nested ? q.eq('property_id', r.property_id) : q;
    };

    try {
      if (table === 'user_preferences') {
        // Personal settings: one row per person, no one else edits it.
        const row = { user_id: userId, org_id: ws.id, ...after.get('me') };
        const { error } = await db.from(table).upsert(row, { onConflict: CONFLICT[table] });
        if (error) throw error;
        confirmed.set(table, new Map(after));
        continue;
      }
      if (table === 'workspace_settings') {
        const row = after.get(ws.id)!;
        let q = db.from(table).update({ company_profile: row.company_profile, custom_document_types: row.custom_document_types }).eq('org_id', ws.id);
        if (v.get(ws.id)) q = q.eq('updated_at', v.get(ws.id)!);
        const { data: out, error } = await q.select('updated_at');
        if (error) throw error;
        if (!out?.length) conflicts.push({ table, key: ws.id });
        else { done.set(ws.id, row); v.set(ws.id, String(out[0].updated_at)); }
        continue;
      }

      const inserts = upserts.filter(([k]) => !before.has(k));
      const updates = upserts.filter(([k]) => before.has(k));

      // New records: insert in batches; if a batch clashes with a record someone else just
      // created under the same id, retry one by one to find which.
      for (let i = 0; i < inserts.length; i += 500) {
        const batch = inserts.slice(i, i + 500);
        const { data: out, error } = await db.from(table).insert(batch.map(([, r]) => r)).select('id, updated_at' + (nested ? ', property_id' : ''));
        if (!error) {
          for (const r of (out || []) as unknown as Row[]) v.set(rowKey(table, r), String(r.updated_at));
          batch.forEach(([k, r]) => done.set(k, r));
          continue;
        }
        if (error.code !== '23505') throw error;
        await pool(batch, 6, async ([k, r]) => {
          const one = await db.from(table).insert(r).select('updated_at');
          if (one.error?.code === '23505') { conflicts.push({ table, key: k }); return; }
          if (one.error) throw one.error;
          done.set(k, r); v.set(k, String(one.data?.[0]?.updated_at));
        });
      }

      await pool(updates, 6, async ([k, r]) => {
        let q = scope(db.from(table).update(r), r);
        if (v.get(k)) q = q.eq('updated_at', v.get(k)!);
        const { data: out, error } = await q.select('updated_at');
        if (error) throw error;
        if (!out?.length) { conflicts.push({ table, key: k }); return; }
        done.set(k, r); v.set(k, String(out[0].updated_at));
      });

      await pool(deletes, 6, async k => {
        const r = before.get(k)!;
        let q = scope(db.from(table).delete(), r);
        if (v.get(k)) q = q.eq('updated_at', v.get(k)!);
        const { data: out, error } = await q.select('id');
        if (error) throw error;
        if (!out?.length) {
          // Nothing deleted: either someone already deleted it (fine) or changed it (keep theirs).
          const still = await scope(db.from(table).select('id'), r).maybeSingle();
          if (still.data) { conflicts.push({ table, key: k }); return; }
        }
        done.delete(k); v.delete(k);
      });
    } catch (err) {
      console.error(`Save failed for ${table}:`, (err as any)?.code || err);
      failed.push(table);
    }
  }
  return { snapshot: confirmed, versions: vers, failed, blocked, conflicts, changed };
}

/** True when the screen holds changes that are not saved yet. */
export function hasUnsaved(previous: Snapshot | null, data: UserData, orgId: string): boolean {
  if (!previous) return false;
  const next = rowsFor(data, orgId);
  for (const [table, rows] of next) {
    const d = diffTable(previous.get(table), rows);
    if (d.upserts.length || d.deletes.length) return true;
  }
  return false;
}

/** Friendly names for messages. */
export const TABLE_LABELS: Record<string, string> = {
  properties: 'properties', property_rent_cheques: 'rent cheques', property_setup_costs: 'setup costs',
  reservations: 'reservations', platforms: 'booking platforms', vendors: 'vendors', service_records: 'service records',
  vendor_invoices: 'invoices', vendor_payments: 'payments', daily_expenses: 'expenses', monthly_bills: 'bills',
  bank_reconciliations: 'bank reconciliations', assets: 'assets', documents: 'documents', maintenance_tasks: 'tasks',
  communication_templates: 'templates', workspace_settings: 'company profile', user_preferences: 'display settings',
};
