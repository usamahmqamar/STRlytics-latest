import type { Statement } from '../lib/ownerStatement';
import { costParts } from '../lib/statementPdf';
import { formatMoney } from '../lib/money';

const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Per property: what the costs were made of, and the expenses and vendor work posted to it. */
export function StatementDetails({ statement }: { statement: Statement }) {
  const lines = statement.lines.filter(l => costParts(l).length || l.items?.length);
  if (!lines.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {lines.map(l => (
        <details key={l.propertyId} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          <summary className="cursor-pointer select-none text-zinc-700 dark:text-zinc-300">
            Costs for {l.propertyName}
            <span className="ml-2 text-xs text-zinc-500">{formatMoney(l.costs, l.currency)}{l.items?.length ? ` · ${l.items.length + (l.itemsMore?.count ?? 0)} item${l.items.length + (l.itemsMore?.count ?? 0) === 1 ? '' : 's'}` : ''}</span>
          </summary>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {costParts(l).map(([label, v]) => (
                <tr key={label}><td className="py-1 text-zinc-500">{label}</td><td className="py-1 text-right tabular-nums">{formatMoney(v, l.currency)}</td></tr>
              ))}
            </tbody>
          </table>
          {!!l.items?.length && (
            <>
              <p className="mt-3 text-xs font-medium text-zinc-600 dark:text-zinc-400">Expenses and work on this property</p>
              <table className="mt-1 w-full text-xs">
                <tbody>
                  {l.items.map((it, i) => (
                    <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800/60">
                      <td className="whitespace-nowrap py-1 pr-3 text-zinc-500">{day(it.date)}</td>
                      <td className="py-1 pr-3">
                        {it.category}{it.type === 'vendor_work' && <span className="ml-1 text-zinc-400">(vendor)</span>}
                        {it.description && <span className="block text-zinc-500">{it.description}</span>}
                      </td>
                      <td className="py-1 text-right tabular-nums">{formatMoney(it.amount, l.currency)}</td>
                    </tr>
                  ))}
                  {l.itemsMore && (
                    <tr className="border-t border-zinc-100 dark:border-zinc-800/60">
                      <td /><td className="py-1 pr-3 text-zinc-500">and {l.itemsMore.count} more</td>
                      <td className="py-1 text-right tabular-nums text-zinc-500">{formatMoney(l.itemsMore.amount, l.currency)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
          <p className="mt-2 text-[11px] text-zinc-400">For the whole property, before the owner's share.</p>
        </details>
      ))}
    </div>
  );
}
