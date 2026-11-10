import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NewOrderPage from './page';

vi.mock('@/server/actions', () => ({ createPortfolioOrderAction: vi.fn() }));

describe('NewOrderPage', () => {
  it('shows the order form with a sample order filled in', () => {
    render(<NewOrderPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Split a portfolio order');
    expect(screen.getByRole('textbox', { name: 'Symbol, row 1' })).toHaveValue('AAPL');
    expect(screen.getByRole('button', { name: 'Split order' })).toBeEnabled();
  });
});
