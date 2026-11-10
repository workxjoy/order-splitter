import { OrderType, type PaginationMeta } from '@order-splitter/shared';
import Link from 'next/link';
import { historyHref } from '@/lib/history-query';

const FILTERS: readonly { label: string; value: OrderType | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Buy', value: OrderType.BUY },
  { label: 'Sell', value: OrderType.SELL },
];

const FIRST_PAGE = 1;

export function OrderTypeFilter({ active }: { active: OrderType | undefined }) {
  return (
    <nav
      aria-label="Filter by order type"
      className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
    >
      {FILTERS.map(({ label, value }) => {
        const isActive = value === active;
        return (
          <Link
            key={label}
            href={historyHref(FIRST_PAGE, value)}
            aria-current={isActive ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pagination({
  meta,
  orderType,
}: {
  meta: PaginationMeta;
  orderType: OrderType | undefined;
}) {
  if (meta.totalPages <= FIRST_PAGE) return null;
  const hasPrevious = meta.page > FIRST_PAGE;
  const hasNext = meta.page < meta.totalPages;
  const linkClass = 'btn-secondary';
  const disabledClass = `${linkClass} pointer-events-none opacity-50`;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Page {meta.page} of {meta.totalPages} · {meta.totalItems} orders
      </p>
      <div className="flex gap-2">
        <Link
          href={historyHref(meta.page - 1, orderType)}
          className={hasPrevious ? linkClass : disabledClass}
          aria-disabled={!hasPrevious}
          tabIndex={hasPrevious ? undefined : -1}
        >
          ← Previous
        </Link>
        <Link
          href={historyHref(meta.page + 1, orderType)}
          className={hasNext ? linkClass : disabledClass}
          aria-disabled={!hasNext}
          tabIndex={hasNext ? undefined : -1}
        >
          Next →
        </Link>
      </div>
    </nav>
  );
}
