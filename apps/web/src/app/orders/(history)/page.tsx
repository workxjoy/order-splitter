import { PaginationLimits } from '@order-splitter/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { portfolioOrdersApi } from '@/server/api-client';
import { OrderHistoryView } from '@/components/orders/order-history-view';
import { historyHref, parseHistoryQuery } from '@/lib/history-query';

export const metadata: Metadata = { title: 'Order history' };

export default async function OrderHistoryPage({ searchParams }: PageProps<'/orders'>) {
  const query = parseHistoryQuery(await searchParams);
  const history = await portfolioOrdersApi.list(query);

  // e.g. a stale link after the API restarted: show the last page rather than an empty one.
  const lastPage = Math.max(history.meta.totalPages, PaginationLimits.MIN_PAGE);
  if (query.page > lastPage) redirect(historyHref(lastPage, query.orderType));

  return <OrderHistoryView history={history} query={query} />;
}
