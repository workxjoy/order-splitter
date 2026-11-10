import { OrderType, type PortfolioOrderListResponse } from '@order-splitter/shared';
import { render, screen, within } from '@testing-library/react';
import { redirect } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { orderRoute } from '@/lib/constants';
import { portfolioOrdersApi } from '@/server/api-client';
import { orderList, portfolioOrder } from '@/test/fixtures';
import OrderHistoryPage from './page';

vi.mock('@/server/api-client', () => ({ portfolioOrdersApi: { list: vi.fn() } }));
// Like the real one, redirect() never returns: it throws to abort rendering.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const listOrders = vi.mocked(portfolioOrdersApi.list);

function historyPage(searchParams: Record<string, string>, history: PortfolioOrderListResponse) {
  listOrders.mockResolvedValue(history);
  return OrderHistoryPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  });
}

const pagination = () => screen.getByRole('navigation', { name: 'Pagination' });
const filters = () => screen.getByRole('navigation', { name: 'Filter by order type' });

describe('OrderHistoryPage', () => {
  it('shows the requested page of history, newest first, with links to each order', async () => {
    const named = portfolioOrder();
    const unnamed = portfolioOrder({
      id: '9d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6',
      portfolioName: null,
      orderType: OrderType.SELL,
    });

    render(
      await historyPage(
        { page: '2' },
        orderList([named, unnamed], { page: 2, totalItems: 41, totalPages: 3 }),
      ),
    );

    expect(listOrders).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    const [, first, second] = screen.getAllByRole('row');
    expect(within(first!).getByRole('link', { name: 'Balanced Growth' })).toHaveAttribute(
      'href',
      orderRoute(named.id),
    );
    expect(first).toHaveTextContent('Nov 14, 2026, 12:00 PM EST');
    expect(first).toHaveTextContent('AAPL, TSLA');
    expect(within(second!).getByRole('link', { name: 'Untitled portfolio' })).toHaveAttribute(
      'href',
      orderRoute(unnamed.id),
    );
    expect(second).toHaveTextContent('SELL');
  });

  it('links to the previous and next pages', async () => {
    render(
      await historyPage(
        { page: '2' },
        orderList([portfolioOrder()], { page: 2, totalItems: 41, totalPages: 3 }),
      ),
    );

    expect(pagination()).toHaveTextContent('Page 2 of 3 · 41 orders');
    expect(within(pagination()).getByRole('link', { name: '← Previous' })).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(within(pagination()).getByRole('link', { name: 'Next →' })).toHaveAttribute(
      'href',
      '/orders?page=3',
    );
    expect(within(filters()).getByRole('link', { current: 'page' })).toHaveTextContent('All');
  });

  it('keeps the order-type filter in its links and disables moving before the first page', async () => {
    render(
      await historyPage(
        { orderType: OrderType.SELL },
        orderList([portfolioOrder({ orderType: OrderType.SELL })], {
          totalItems: 30,
          totalPages: 2,
        }),
      ),
    );

    expect(listOrders).toHaveBeenCalledWith({ page: 1, pageSize: 20, orderType: OrderType.SELL });
    expect(within(filters()).getByRole('link', { current: 'page' })).toHaveTextContent('Sell');
    expect(within(filters()).getByRole('link', { name: 'All' })).toHaveAttribute('href', '/orders');
    expect(within(filters()).getByRole('link', { name: 'Buy' })).toHaveAttribute(
      'href',
      '/orders?orderType=BUY',
    );
    expect(within(pagination()).getByRole('link', { name: '← Previous' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(pagination()).getByRole('link', { name: 'Next →' })).toHaveAttribute(
      'href',
      '/orders?orderType=SELL&page=2',
    );
  });

  it('disables moving past the last page', async () => {
    render(
      await historyPage(
        { page: '3' },
        orderList([portfolioOrder()], { page: 3, totalItems: 41, totalPages: 3 }),
      ),
    );

    expect(within(pagination()).getByRole('link', { name: 'Next →' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows an empty state without pagination when there is no history', async () => {
    render(await historyPage({}, orderList([])));

    expect(screen.getByText('No orders yet for this filter.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Split an order' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  describe('a page past the end', () => {
    it('redirects to the last page, keeping the filter', async () => {
      await expect(
        historyPage(
          { page: '7', orderType: OrderType.SELL },
          orderList([], { page: 7, totalItems: 41, totalPages: 3 }),
        ),
      ).rejects.toThrow('NEXT_REDIRECT');

      expect(redirect).toHaveBeenCalledWith('/orders?orderType=SELL&page=3');
    });

    it('redirects to the first page when the history has been cleared', async () => {
      await expect(historyPage({ page: '4' }, orderList([], { page: 4 }))).rejects.toThrow(
        'NEXT_REDIRECT',
      );

      expect(redirect).toHaveBeenCalledWith('/orders');
    });
  });
});
