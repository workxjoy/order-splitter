import type { PortfolioOrderDto } from '@order-splitter/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { OrderBreakdown } from './order-breakdown';
import { PageHeader } from '@/components/ui/page-header';
import { AppRoute } from '@/lib/constants';
import { formatMarketTime } from '@/lib/format';

const DEFAULT_TITLE = 'Portfolio order';

export function OrderDetailsView({ order }: { order: PortfolioOrderDto }) {
  return (
    <div className="space-y-8">
      <Link
        href={AppRoute.HISTORY}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All orders
      </Link>
      <PageHeader
        title={order.portfolioName ?? DEFAULT_TITLE}
        description={
          <>
            Created{' '}
            <time dateTime={order.createdAt}>
              {formatMarketTime(order.createdAt, order.marketTimezone)}
            </time>{' '}
            · <span className="font-mono text-xs text-slate-400">{order.id}</span>
          </>
        }
      />
      <section className="card p-6 sm:p-8">
        <OrderBreakdown order={order} />
      </section>
    </div>
  );
}
