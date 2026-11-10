import type { ListPortfolioOrdersQuery, PortfolioOrderListResponse } from '@order-splitter/shared';
import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { AppRoute } from '@/lib/constants';
import { OrderTypeFilter, Pagination } from './history-controls';
import { OrdersTable } from './orders-table';

interface OrderHistoryViewProps {
  history: PortfolioOrderListResponse;
  query: ListPortfolioOrdersQuery;
}

export function OrderHistoryView({
  history: { data: orders, meta },
  query,
}: OrderHistoryViewProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Order history"
        description="Every split, newest first. History is kept in memory and is cleared when the API restarts."
        actions={<OrderTypeFilter active={query.orderType} />}
      />

      <section className="card overflow-hidden">
        {orders.length > 0 ? (
          <OrdersTable orders={orders} />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Inbox className="size-5" aria-hidden />
            </span>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No orders yet for this filter.
            </p>
            <Link href={AppRoute.NEW_ORDER} className="btn-primary">
              Split an order
            </Link>
          </div>
        )}
      </section>

      <Pagination meta={meta} orderType={query.orderType} />
    </div>
  );
}
