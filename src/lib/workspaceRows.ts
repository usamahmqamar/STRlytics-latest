/**
 * The workspace tables and how their rows map to the app's UserData shape. No database client
 * here, so the same code runs in the browser and in server jobs (owner reports).
 */
import type { UserData } from '../types';
import { DEFAULT_USER_DATA } from '../constants';

export type Row = Record<string, unknown>;

export interface TableDef {
  table: string;
  collection: keyof UserData;
  idField: string;
  cols: string[];
  dates?: string[];
  ints?: string[];
  staffCanWrite: boolean;
}

// Column names match the app's field names; `idField` is stored in the `id` column.
export const TABLES: TableDef[] = [
  { table: 'reservations', collection: 'reservations', idField: 'reservation_code', staffCanWrite: true,
    cols: ['currency', 'apartment_id', 'platform_id', 'channel', 'guest_name', 'check_in', 'check_in_time', 'check_out', 'check_out_time',
      'num_guests', 'nights', 'total_booking_revenue', 'net_payout', 'payout_date', 'cleaning_cost', 'status',
      'cancellation_policy', 'booking_date', 'non_refundable_date', 'rating', 'notes', 'damages_incurred', 'other_booking_costs',
      'source_document_id'],
    dates: ['check_in', 'check_out', 'payout_date', 'booking_date', 'non_refundable_date'], ints: ['num_guests', 'nights'] },
  { table: 'platforms', collection: 'platforms', idField: 'platform_id', staffCanWrite: false,
    cols: ['name', 'commission_percent', 'payment_charge_percent', 'vat_percent', 'other_charges_percent', 'payout_timing',
      'payout_day_of_week', 'payout_days_offset', 'processing_days'],
    ints: ['payout_day_of_week', 'payout_days_offset', 'processing_days'] },
  { table: 'vendors', collection: 'vendors', idField: 'vendor_id', staffCanWrite: false,
    cols: ['name', 'service_type', 'phone', 'email', 'status'] },
  { table: 'service_records', collection: 'serviceRecords', idField: 'record_id', staffCanWrite: true,
    cols: ['currency', 'date', 'apartment_id', 'service_type', 'vendor_id', 'description', 'quantity', 'unit_cost', 'total_cost', 'status', 'invoice_id'],
    dates: ['date'] },
  { table: 'vendor_invoices', collection: 'invoices', idField: 'invoice_id', staffCanWrite: false,
    cols: ['currency', 'vendor_id', 'record_ids', 'total_amount', 'date', 'status'], dates: ['date'] },
  { table: 'vendor_payments', collection: 'payments', idField: 'payment_id', staffCanWrite: false,
    cols: ['currency', 'date', 'vendor_id', 'amount_paid', 'type', 'invoice_id', 'notes'], dates: ['date'] },
  { table: 'daily_expenses', collection: 'dailyExpenses', idField: 'expense_id', staffCanWrite: true,
    cols: ['currency', 'apartment_id', 'date', 'category', 'amount', 'notes'], dates: ['date'] },
  { table: 'monthly_bills', collection: 'monthlyBills', idField: 'bill_id', staffCanWrite: true,
    cols: ['currency', 'apartment_id', 'month', 'bill_type', 'amount', 'status', 'paid_date'], dates: ['paid_date'] },
  { table: 'bank_reconciliations', collection: 'bankReconciliations', idField: 'reconciliation_id', staffCanWrite: false,
    cols: ['date', 'actual_balance', 'notes'], dates: ['date'] },
  { table: 'assets', collection: 'assets', idField: 'asset_id', staffCanWrite: true,
    cols: ['currency', 'apartment_id', 'name', 'category', 'purchase_date', 'warranty_expiry', 'condition', 'last_serviced_date',
      'next_service_due', 'cost', 'notes'],
    dates: ['purchase_date', 'warranty_expiry', 'last_serviced_date', 'next_service_due'] },
  { table: 'documents', collection: 'documents', idField: 'doc_id', staffCanWrite: true,
    cols: ['apartment_id', 'title', 'type', 'expiry_date', 'file_url', 'status'], dates: ['expiry_date'] },
  { table: 'maintenance_tasks', collection: 'maintenanceTasks', idField: 'task_id', staffCanWrite: true,
    cols: ['apartment_id', 'title', 'description', 'priority', 'status', 'created_at', 'due_date', 'vendor_id',
      'cost_estimate', 'actual_cost'],
    dates: ['due_date'] },
  { table: 'communication_templates', collection: 'communicationTemplates', idField: 'template_id', staffCanWrite: true,
    cols: ['name', 'subject', 'content', 'category'] },
];

export const PROPERTY_COLS = ['name', 'nickname', 'building', 'address', 'specification', 'measurement_sqft', 'start_operation_date',
  'annual_rent', 'monthly_rent', 'num_cheques', 'currency', 'status', 'tenancy_end_date',
  'utilities_monthly_defaults', 'platform_settings', 'tenancy_history',
  'country', 'region', 'city', 'timezone'];
export const CHEQUE_COLS = ['cheque_number', 'due_date', 'amount', 'currency', 'status'];
export const SETUP_COLS = ['date', 'category', 'description', 'amount', 'currency', 'is_refundable', 'payment_method', 'vendor'];

// ---------- value conversion ----------
export function toDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return Number.isNaN(Date.parse(m[1])) ? null : m[1];
}

export function toCell(v: unknown, isDate: boolean, isInt: boolean): unknown {
  if (v === undefined || v === '' && isDate) return null;
  if (isDate) return toDate(v);
  if (isInt && v !== null) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

export function pick(item: any, cols: string[], dates: string[] = [], ints: string[] = []): Row {
  const row: Row = {};
  for (const c of cols) row[c] = toCell(item?.[c], dates.includes(c), ints.includes(c));
  return row;
}

export function unpick(row: Row, cols: string[]): Row {
  const item: Row = {};
  for (const c of cols) if (row[c] !== null && row[c] !== undefined) item[c] = row[c];
  return item;
}


export interface WorkspaceRows {
  properties: Row[];
  property_rent_cheques: Row[];
  property_setup_costs: Row[];
  /** Rows of each table in TABLES, by table name. */
  tables: Record<string, Row[]>;
}

/** Builds UserData (properties with their cheques and setup costs, and every list) from rows. */
export function assembleUserData(rows: WorkspaceRows): UserData {
  const byProp = (list: Row[], cols: string[], idName: string) => {
    const m = new Map<string, Row[]>();
    for (const r of list) {
      const items = m.get(r.property_id as string) || [];
      items.push({ [idName]: r.id, ...unpick(r, cols) });
      m.set(r.property_id as string, items);
    }
    return m;
  };
  const chequesBy = byProp(rows.property_rent_cheques, CHEQUE_COLS, 'cheque_id');
  const setupBy = byProp(rows.property_setup_costs, SETUP_COLS, 'item_id');
  const data: any = {
    ...DEFAULT_USER_DATA,
    apartments: rows.properties.map(p => ({
      apartment_id: p.id,
      ...unpick(p, PROPERTY_COLS),
      utilities_monthly_defaults: p.utilities_monthly_defaults || { electricity: 0, internet: 0 },
      rent_cheques: chequesBy.get(p.id as string) || [],
      setup_costs: setupBy.get(p.id as string) || [],
    })),
  };
  for (const def of TABLES) {
    data[def.collection] = (rows.tables[def.table] || []).map(r => ({ [def.idField]: r.id, ...unpick(r, def.cols) }));
  }
  return data as UserData;
}
