import {
  listPortfolioOrdersQuerySchema,
  PaginationLimits,
  type ListPortfolioOrdersQuery,
  type OrderType,
} from '@order-splitter/shared';
import { AppRoute, SearchParam } from './constants';

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Each param is read on its own, so a bad page number does not also drop the order-type filter.
// Invalid values fall back to the defaults.
export function parseHistoryQuery(searchParams: SearchParams): ListPortfolioOrdersQuery {
  const page = listPortfolioOrdersQuerySchema.safeParse({
    page: first(searchParams[SearchParam.PAGE]),
  });
  const orderType = listPortfolioOrdersQuerySchema.safeParse({
    orderType: first(searchParams[SearchParam.ORDER_TYPE]),
  });
  return {
    page: page.success ? page.data.page : PaginationLimits.DEFAULT_PAGE,
    pageSize: PaginationLimits.DEFAULT_PAGE_SIZE,
    ...(orderType.success && orderType.data.orderType && { orderType: orderType.data.orderType }),
  };
}

// Leaves out default values to keep links short.
export function historyHref(page: number, orderType?: OrderType): string {
  const params = new URLSearchParams();
  if (orderType) params.set(SearchParam.ORDER_TYPE, orderType);
  if (page > PaginationLimits.DEFAULT_PAGE) params.set(SearchParam.PAGE, String(page));
  const query = params.toString();
  return query ? `${AppRoute.HISTORY}?${query}` : AppRoute.HISTORY;
}
