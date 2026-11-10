import type { PortfolioOrderDto } from '@order-splitter/shared';
import type { ReactNode } from 'react';
import { OrderTypeBadge, PriceSourceBadge } from './order-badges';
import { formatMarketTime, formatPercent, formatUsd } from '@/lib/format';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1.5 text-sm font-semibold">{children}</dd>
    </div>
  );
}

export function OrderBreakdown({ order }: { order: PortfolioOrderDto }) {
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Type">
          <OrderTypeBadge orderType={order.orderType} />
        </Stat>
        <Stat label="Total amount">
          <span className="numeric">{formatUsd(order.totalAmount)}</span>
        </Stat>
        <Stat label="Estimated">
          <span className="numeric">{formatUsd(order.estimatedTotalAmount)}</span>
        </Stat>
        <Stat label="Unallocated">
          <span className="numeric">{formatUsd(order.unallocatedAmount)}</span>
        </Stat>
        <Stat label="Execute at">
          <time dateTime={order.executeAt}>
            {formatMarketTime(order.executeAt, order.marketTimezone)}
          </time>
        </Stat>
        <Stat label="Quantity precision">{order.quantityPrecision} dp</Stat>
      </dl>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <caption className="sr-only">Orders per stock</caption>
          <thead className="bg-slate-50/80 text-left text-xs font-medium text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-2.5">
                Symbol
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Weight
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Price
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Amount
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Quantity
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Estimated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {order.orders.map((stock) => (
              <tr key={stock.symbol}>
                <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                  {stock.symbol}
                </th>
                <td className="numeric px-4 py-2.5 text-right">{formatPercent(stock.percent)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="inline-flex items-center gap-2">
                    <span className="numeric">{formatUsd(stock.price)}</span>
                    <PriceSourceBadge source={stock.priceSource} />
                  </span>
                </td>
                <td className="numeric px-4 py-2.5 text-right">{formatUsd(stock.amount)}</td>
                <td className="numeric px-4 py-2.5 text-right font-semibold">{stock.quantity}</td>
                <td className="numeric px-4 py-2.5 text-right">
                  {formatUsd(stock.estimatedAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
