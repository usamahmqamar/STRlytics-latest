/**
 * /owner — what a property owner sees when they sign in: their share of each property's profit
 * for the month so far, and the statements prepared for them. Nothing else from the workspace.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Download, Loader2, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { FullPageSpinner } from '../../auth/RequireAuth';
import { Brand } from '../auth/AuthLayout';
import { Button } from '../../components/ui/Button';
import { formatMoney } from '../../lib/money';
import { StatementDetails } from '../../components/StatementDetails';
import type { Statement } from '../../lib/ownerStatement';

interface Portal { org_id: string; org_name: string; entity_id: string; entity_name: string; reporting_currency: string }
interface Row {
  id: string; kind: 'month_to_date' | 'monthly' | 'quarterly' | 'yearly';
  period_start: string; period_end: string; currency: string; total: number; statement: Statement; prepared_at: string;
}

const day = (iso: string) => format(parseISO(iso), 'd MMM yyyy');
const label = (r: Row) =>
  r.kind === 'yearly' ? r.period_start.slice(0, 4)
    : r.kind === 'quarterly' ? `Q${Math.floor((Number(r.period_start.slice(5, 7)) - 1) / 3) + 1} ${r.period_start.slice(0, 4)}`
      : format(parseISO(r.period_start), 'MMMM yyyy');

export const OwnerPortalPage: React.FC = () => {
  const { user, workspaces, signOut } = useAuth();
  const [portals, setPortals] = useState<Portal[] | null>(null);
  const [key, setKey] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('my_owner_portals').then(({ data, error }) => {
      if (error) { setError('Could not load your statements. Please try again.'); setPortals([]); return; }
      const list = (data ?? []) as Portal[];
      setPortals(list);
      if (list.length) setKey(`${list[0].org_id}|${list[0].entity_id}`);
    });
  }, []);

  const portal = useMemo(() => portals?.find(p => `${p.org_id}|${p.entity_id}` === key) ?? null, [portals, key]);

  useEffect(() => {
    if (!portal) return;
    setRows(null);
    supabase.from('owner_statements')
      .select('id, kind, period_start, period_end, currency, total, statement, prepared_at')
      .eq('org_id', portal.org_id).eq('entity_id', portal.entity_id)
      .order('period_start', { ascending: false }).limit(120)
      .then(({ data, error }) => {
        if (error) { setError('Could not load your statements. Please try again.'); setRows([]); return; }
        setRows((data ?? []).map((r: any) => ({ ...r, total: Number(r.total) })));
      });
  }, [portal]);

  const download = async (r: Row) => {
    if (!portal) return;
    setBusy(r.id);
    try {
      const { statementPdf } = await import('../../lib/statementPdf');
      const bytes = await statementPdf(r.statement, { ownerName: portal.entity_name, workspaceName: portal.org_name });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `owner-statement-${label(r).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally { setBusy(null); }
  };

  if (!portals) return <FullPageSpinner />;

  const current = rows?.find(r => r.kind === 'month_to_date');
  const past = rows?.filter(r => r.kind !== 'month_to_date') ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Brand />
          <div className="flex items-center gap-2">
            {workspaces.length > 0 && <Link to="/app/dashboard" className="text-sm font-medium text-emerald-700 hover:underline">Open your workspace</Link>}
            <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut size={14} /> Sign out</Button>
          </div>
        </header>

        {portals.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-sm text-zinc-600">
            <h1 className="text-xl font-semibold text-zinc-900">No owner statements</h1>
            <p className="mt-2">{error ?? `${user?.email} has no owner login. Ask the company that manages your property to send you an invitation.`}</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500">Owner statements from {portal?.org_name}</p>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{portal?.entity_name}</h1>
              </div>
              {portals.length > 1 && (
                <select aria-label="Choose owner" className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm" value={key} onChange={e => setKey(e.target.value)}>
                  {portals.map(p => <option key={`${p.org_id}|${p.entity_id}`} value={`${p.org_id}|${p.entity_id}`}>{p.entity_name}, {p.org_name}</option>)}
                </select>
              )}
            </div>

            {!rows ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
            ) : (
              <>
                <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">This month so far</h2>
                  {current ? (
                    <>
                      <p className="mt-1 text-xs text-zinc-500">{day(current.period_start)} to {day(current.period_end)}. Updated daily.</p>
                      <p className="mt-4 text-xs text-zinc-500">Your share of profit</p>
                      <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(current.total, current.currency)}</p>
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                              <th className="py-2 pr-3 font-medium">Property</th>
                              <th className="py-2 pr-3 text-right font-medium">Revenue</th>
                              <th className="py-2 pr-3 text-right font-medium">Costs</th>
                              <th className="py-2 pr-3 text-right font-medium">Your share</th>
                              <th className="py-2 pr-1 text-right font-medium">Your part</th>
                            </tr>
                          </thead>
                          <tbody>
                            {current.statement.lines.map(l => (
                              <tr key={l.propertyId} className="border-b border-zinc-100 dark:border-zinc-800/60">
                                <td className="py-2.5 pr-3">{l.propertyName}<span className="block text-xs text-zinc-500">{l.nightsBooked} nights booked</span></td>
                                <td className="py-2.5 pr-3 text-right">{formatMoney(l.revenue, l.currency)}</td>
                                <td className="py-2.5 pr-3 text-right">{formatMoney(l.costs, l.currency)}</td>
                                <td className="py-2.5 pr-3 text-right">{l.shareEnd}%</td>
                                <td className="py-2.5 pr-1 text-right font-medium">{formatMoney(l.ownerProfit, l.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <StatementDetails statement={current.statement} />
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500">Figures for this month appear from the 2nd.</p>
                  )}
                </section>

                <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Statements</h2>
                  {past.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">Your first statement will appear here after the end of the month.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
                      {past.map(r => (
                        <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label(r)}</p>
                            <p className="text-xs text-zinc-500">{r.kind === 'monthly' ? 'Monthly' : r.kind === 'quarterly' ? 'Quarterly' : 'Yearly summary'} · {formatMoney(r.total, r.currency)}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => download(r)} disabled={busy === r.id}>
                            {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <p className="mt-6 text-xs text-zinc-500">
                  Prepared by {portal?.org_name} from their records. Questions about these figures go to them. This is not tax advice.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
