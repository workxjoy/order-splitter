import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoute } from '@/lib/constants';
import NotFound from './not-found';
import OrderNotFound from './orders/[id]/not-found';

describe('NotFound', () => {
  it('says the page does not exist and links to a new order', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByText(/order does not exist/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New order' })).toHaveAttribute(
      'href',
      AppRoute.NEW_ORDER,
    );
  });
});

describe('OrderNotFound', () => {
  it('explains that history resets with the API and links back to it', () => {
    render(<OrderNotFound />);

    expect(screen.getByRole('heading', { name: 'Order not found' })).toBeInTheDocument();
    expect(screen.getByText(/cleared whenever the API restarts/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to order history' })).toHaveAttribute(
      'href',
      AppRoute.HISTORY,
    );
  });
});
