/**
 * First-run guidance. Each step completes itself from the workspace's real data,
 * so the list disappears once the workspace is set up.
 */
import React from 'react';
import { Building2, Check, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import type { UserData } from '../types';

interface Step {
  title: string;
  detail: string;
  done: boolean;
  action: string;
  onClick: () => void;
}

export function setupSteps(data: UserData, go: (tab: string) => void, importPdfs: () => void): Step[] {
  const hasUnit = data.apartments.length > 0;
  return [
    {
      title: 'Add your first property',
      detail: 'Name, size, the date you started operating it, and the annual rent.',
      done: hasUnit,
      action: 'Add a property',
      onClick: () => go('setup'),
    },
    {
      title: 'Add the lease and rent cheques',
      detail: 'Cheque dates and amounts, so rent shows on the right days and due cheques are flagged.',
      done: data.apartments.some(a => (a.rent_cheques || []).length > 0),
      action: 'Add rent cheques',
      onClick: () => go('setup'),
    },
    {
      title: 'Bring in your bookings',
      detail: 'Upload booking PDFs from Airbnb, Booking.com and others, or add bookings one by one.',
      done: data.reservations.length > 0,
      action: 'Import from PDFs',
      onClick: importPdfs,
    },
    {
      title: 'Record running costs',
      detail: 'Electricity and internet defaults, or this month’s bills and expenses.',
      done: data.monthlyBills.length > 0 || data.dailyExpenses.length > 0
        || data.apartments.some(a => (a.utilities_monthly_defaults?.electricity || 0) + (a.utilities_monthly_defaults?.internet || 0) > 0),
      action: 'Add costs',
      onClick: () => go('operations'),
    },
  ];
}

export const GettingStarted: React.FC<{ data: UserData; onTabChange: (tab: string) => void; onImportPdfs: () => void }> = ({ data, onTabChange, onImportPdfs }) => {
  const steps = setupSteps(data, onTabChange, onImportPdfs);
  const done = steps.filter(s => s.done).length;
  if (done === steps.length) return null;
  const next = steps.findIndex(s => !s.done);

  return (
    <section aria-label="Get started" className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-7 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">Set up your workspace</h2>
          <p className="mt-1 text-sm text-zinc-500">Four steps, and your daily profit per unit starts calculating.</p>
        </div>
        <p className="text-sm text-zinc-500">{done} of {steps.length} done</p>
      </div>
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-5 divide-y divide-zinc-100 dark:divide-zinc-800">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-4 py-3.5">
            <span
              className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                s.done ? 'bg-emerald-600 text-white' : i === next ? 'border-2 border-emerald-600 text-emerald-700' : 'border border-zinc-300 text-zinc-500 dark:border-zinc-700')}
              aria-hidden
            >
              {s.done ? <Check size={14} strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', s.done ? 'text-zinc-500 line-through decoration-zinc-300' : 'text-zinc-900 dark:text-zinc-100')}>{s.title}</p>
              {!s.done && <p className="text-xs text-zinc-500">{s.detail}</p>}
            </div>
            {!s.done && (
              i === next
                ? <Button size="sm" onClick={s.onClick}>{s.action}</Button>
                : <button onClick={s.onClick} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">{s.action} <ChevronRight size={13} /></button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};

/** Shown on screens that need at least one property. */
export const NeedsProperty: React.FC<{ screen: string; onAdd: () => void }> = ({ screen, onAdd }) => (
  <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-14 text-center dark:border-zinc-700">
    <Building2 size={22} className="mx-auto text-zinc-400" />
    <p className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">{screen} starts with a property</p>
    <p className="mx-auto mt-1.5 max-w-sm text-sm text-zinc-500">Add the first unit you operate, with its rent, and this screen fills in from your bookings and costs.</p>
    <div className="mt-5 flex justify-center"><Button onClick={onAdd}>Add a property</Button></div>
  </div>
);
