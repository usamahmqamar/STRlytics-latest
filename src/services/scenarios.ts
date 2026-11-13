/**
 * Saved feasibility scenarios (shared with the workspace) and turning one into a property.
 */
import { addMonths, format, parseISO, subDays } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { Apartment, Platform, RentCheque } from '../types';

export interface Scenario {
  id: string;
  name: string;
  inputs: Record<string, any>;
  converted_apartment_id: string | null;
  created_at: string;
}

const fail = (error: any, message: string): never => {
  console.error(message, error?.code || error?.message);
  throw new Error(error?.code === '42501' ? 'Your role cannot change saved units.' : message);
};

export async function listScenarios(orgId: string): Promise<Scenario[]> {
  const { data, error } = await supabase.from('feasibility_scenarios').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200);
  if (error) fail(error, 'Could not load saved units.');
  return (data || []) as Scenario[];
}

export async function saveScenario(orgId: string, name: string, inputs: Record<string, any>, id?: string | null): Promise<Scenario> {
  const row = { name: name.trim().slice(0, 120), inputs };
  const q = id
    ? supabase.from('feasibility_scenarios').update(row).eq('org_id', orgId).eq('id', id).select('*').single()
    : supabase.from('feasibility_scenarios').insert({ org_id: orgId, ...row }).select('*').single();
  const { data, error } = await q;
  if (error) fail(error, 'Could not save this unit.');
  return data as Scenario;
}

export async function deleteScenario(orgId: string, id: string) {
  const { error } = await supabase.from('feasibility_scenarios').delete().eq('org_id', orgId).eq('id', id);
  if (error) fail(error, 'Could not delete this unit.');
}

export async function markConverted(orgId: string, id: string, apartmentId: string) {
  await supabase.from('feasibility_scenarios').update({ converted_apartment_id: apartmentId }).eq('org_id', orgId).eq('id', id);
}

const SPEC: Record<number, Apartment['specification']> = { 0: 'Studio', 1: '1BR', 2: '2BR', 3: '3BR', 4: '4BR' };

/**
 * A new property from a scenario: one-year lease from the first month of bookings, rent cheques
 * spread evenly, the furnishing cost as a setup cost and the deposit as a refundable one.
 * Running costs are not split into utilities automatically; the operator sets them after.
 */
export function apartmentFromScenario(name: string, f: Record<string, any>, existingIds: Set<string>, platforms: Platform[]): Apartment {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'unit';
  let id = base;
  for (let n = 2; existingIds.has(id); n++) id = `${base}-${n}`;

  const start = `${f.startMonth}-01`;
  const end = format(subDays(addMonths(parseISO(start), 12), 1), 'yyyy-MM-dd');
  const annual = Math.max(0, Math.round(Number(f.annualRent) || 0));
  const count = [1, 2, 4, 6, 12].includes(Number(f.cheques)) ? Number(f.cheques) : 4;
  const each = Math.round(annual / count);
  const rent_cheques: RentCheque[] = Array.from({ length: count }, (_, i) => ({
    cheque_id: `CHQ-${id}-${i + 1}`,
    due_date: format(addMonths(parseISO(start), (i * 12) / count), 'yyyy-MM-dd'),
    // the last cheque takes any rounding so the total equals the annual rent
    amount_aed: i === count - 1 ? annual - each * (count - 1) : each,
    status: 'due',
  }));
  const setup = Math.max(0, Math.round(Number(f.setupCost) || 0));
  const deposit = Math.round(annual * (Math.max(0, Number(f.depositPercent) || 0) / 100));

  return {
    apartment_id: id,
    name: name.trim().slice(0, 120),
    nickname: id,
    building: '',
    address: String(f.location || '').slice(0, 200),
    specification: SPEC[Number(f.bedrooms)] ?? '1BR',
    measurement_sqft: 0,
    start_operation_date: start,
    tenancy_end_date: end,
    annual_rent_aed: annual,
    monthly_rent_aed: Math.round(annual / 12),
    num_cheques: count,
    rent_cheques,
    utilities_monthly_defaults: { dewa_electricity_aed: 0, internet_aed: 0 },
    setup_costs: [
      ...(setup ? [{ item_id: `SET-${id}-1`, date: start, category: 'Furnishing' as const, description: 'Furnishing and setup (from feasibility)', amount_aed: setup, is_refundable: false, payment_method: '', vendor: '' }] : []),
      ...(deposit ? [{ item_id: `SET-${id}-2`, date: start, category: 'Deposit' as const, description: 'Security deposit', amount_aed: deposit, is_refundable: true, payment_method: '', vendor: '' }] : []),
    ],
    currency: 'AED',
    status: 'active',
    tenancy_history: [],
    platform_settings: platforms.map(p => ({ platform_id: p.platform_id, commission_percent: p.commission_percent, payment_charge_percent: p.payment_charge_percent || 0 })),
  };
}
