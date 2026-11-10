import type { PortfolioOrderDto } from '@order-splitter/shared';
import Link from 'next/link';
import { OrderTypeBadge } from './order-badges';
import { orderRoute } from '@/lib/constants';
import { formatMarketTime, formatUsd } from '@/lib/format';

const UNNAMED_PORTFOLIO = 'Untitled portfolio';

export function OrdersTable({ orders }: { orders: readonly PortfolioOrderDto[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
        <caption className="sr-only">Historic portfolio orders, newest first</caption>
        <thead className="bg-slate-50/80 text-left text-xs font-medium text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3">
              Created
            </th>
            <th scope="col" className="px-4 py-3">
              Type
            </th>
            <th scope="col" className="px-4 py-3">
              Portfolio
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Stocks
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Total
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Unallocated
            </th>
            <th scope="col" className="px-4 py-3">
              Execute at
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td className="whitespace-nowrap px-4 py-3">
                <time dateTime={order.createdAt}>
                  {formatMarketTime(order.createdAt, order.marketTimezone)}
                </time>
              </td>
              <td className="px-4 py-3">
                <OrderTypeBadge orderType={order.orderType} />
              </td>
              <td className="px-4 py-3">
                <Link
                  href={orderRoute(order.id)}
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {order.portfolioName ?? UNNAMED_PORTFOLIO}
                </Link>
                <span className="block text-xs text-slate-500">
                  {order.orders.map((stock) => stock.symbol).join(', ')}
                </span>
              </td>
              <td className="numeric px-4 py-3 text-right">{order.orders.length}</td>
              <td className="numeric px-4 py-3 text-right">{formatUsd(order.totalAmount)}</td>
              <td className="numeric px-4 py-3 text-right">{formatUsd(order.unallocatedAmount)}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <time dateTime={order.executeAt}>
                  {formatMarketTime(order.executeAt, order.marketTimezone)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
