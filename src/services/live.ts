/**
 * Live updates: tells the app when anything in the workspace changes, so teammates' edits
 * appear without a refresh. Supabase Realtime applies the same row-level security as reads.
 */
import { supabase } from '../lib/supabase';

export const LIVE_TABLES = [
  'properties', 'property_rent_cheques', 'property_setup_costs', 'reservations', 'platforms', 'vendors',
  'service_records', 'vendor_invoices', 'vendor_payments', 'daily_expenses', 'monthly_bills',
  'bank_reconciliations', 'assets', 'documents', 'maintenance_tasks', 'communication_templates', 'workspace_settings',
];

export function subscribeToWorkspace(orgId: string, onChange: () => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    channel = supabase.channel(`workspace:${orgId}`);
    for (const table of LIVE_TABLES) {
      channel.on('postgres_changes' as any, { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, onChange);
    }
    channel.subscribe();
  } catch {
    // Live updates are a convenience; the app still saves safely without them.
  }
  return () => { if (channel) supabase.removeChannel(channel); };
}
