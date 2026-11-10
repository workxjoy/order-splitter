import type { PortfolioOrderDto } from '@order-splitter/shared';
import { render, screen, within } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { AppRoute } from '@/lib/constants';
import { portfolioOrdersApi } from '@/server/api-client';
import { ORDER_ID, portfolioOrder } from '@/test/fixtures';
import OrderDetailsPage from './page';

vi.mock('@/server/api-client', () => ({ portfolioOrdersApi: { get: vi.fn() } }));
// Like the real one, notFound() never returns: it throws to render the not-found page instead.
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

const getOrder = vi.mocked(portfolioOrdersApi.get);

function detailsPage(order: PortfolioOrderDto | null) {
  getOrder.mockResolvedValue(order);
  return OrderDetailsPage({
    params: Promise.resolve({ id: ORDER_ID }),
    searchParams: Promise.resolve({}),
  });
}

describe('OrderDetailsPage', () => {
  it('shows the order summary and the order for each stock', async () => {
    render(await detailsPage(portfolioOrder()));

    expect(getOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Balanced Growth');
    expect(screen.getByRole('link', { name: 'All orders' })).toHaveAttribute(
      'href',
      AppRoute.HISTORY,
    );
    expect(screen.getByText(ORDER_ID)).toBeInTheDocument();
    expect(screen.getByText('Nov 16, 2026, 9:30 AM EST')).toBeInTheDocument();

    const aapl = screen.getByRole('rowheader', { name: 'AAPL' }).closest('tr');
    expect(aapl).not.toBeNull();
    expect(within(aapl!).getByText('$187.35')).toBeInTheDocument();
    expect(within(aapl!).getByText('Partner')).toBeInTheDocument();
    expect(aapl).toHaveTextContent('0.320');
    const tsla = screen.getByRole('rowheader', { name: 'TSLA' }).closest('tr');
    expect(within(tsla!).getByText('Fixed')).toBeInTheDocument();
  });

  it('shows times in the time zone of the market the order was placed on', async () => {
    render(
      await detailsPage(
        portfolioOrder({
          marketTimezone: 'Europe/London',
          createdAt: '2026-11-16T07:15:00.000Z',
          executeAt: '2026-11-16T08:00:00.000Z',
        }),
      ),
    );

    expect(screen.getByText('Nov 16, 2026, 7:15 AM GMT')).toBeInTheDocument();
    expect(screen.getByText('Nov 16, 2026, 8:00 AM GMT')).toBeInTheDocument();
  });

  it('uses a generic title for an unnamed portfolio', async () => {
    render(await detailsPage(portfolioOrder({ portfolioName: null })));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Portfolio order');
  });

  it('renders the not-found page when the API has no such order', async () => {
    await expect(detailsPage(null)).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalled();
  });

  it('renders the not-found page for an id that is not a UUID, without calling the API', async () => {
    getOrder.mockClear();

    await expect(
      OrderDetailsPage({
        params: Promise.resolve({ id: 'not-an-order' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(getOrder).not.toHaveBeenCalled();
  });

  it('looks up an upper-case id in the lower case the API issues', async () => {
    getOrder.mockResolvedValue(portfolioOrder());

    await OrderDetailsPage({
      params: Promise.resolve({ id: ORDER_ID.toUpperCase() }),
      searchParams: Promise.resolve({}),
    });

    expect(getOrder).toHaveBeenLastCalledWith(ORDER_ID);
  });
});
