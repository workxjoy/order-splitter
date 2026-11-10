import { OrderType, PriceSource } from '@order-splitter/shared';

const BADGE =
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset';

const ORDER_TYPE_STYLE: Record<OrderType, string> = {
  [OrderType.BUY]:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  [OrderType.SELL]:
    'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300',
};

const PRICE_SOURCE: Record<PriceSource, { label: string; style: string }> = {
  [PriceSource.PARTNER]: {
    label: 'Partner',
    style:
      'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300',
  },
  [PriceSource.FIXED]: {
    label: 'Fixed',
    style: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300',
  },
};

export function OrderTypeBadge({ orderType }: { orderType: OrderType }) {
  return <span className={`${BADGE} ${ORDER_TYPE_STYLE[orderType]}`}>{orderType}</span>;
}

export function PriceSourceBadge({ source }: { source: PriceSource }) {
  const { label, style } = PRICE_SOURCE[source];
  return <span className={`${BADGE} ${style}`}>{label}</span>;
}
