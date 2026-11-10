import { render, screen, within } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { AppRoute, orderRoute } from '@/lib/constants';
import { ORDER_ID } from '@/test/fixtures';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

describe('AppShell', () => {
  it('renders the page inside the main landmark', () => {
    vi.mocked(usePathname).mockReturnValue(AppRoute.NEW_ORDER);

    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );

    expect(screen.getByRole('main')).toHaveTextContent('Page content');
  });

  it.each([
    [AppRoute.NEW_ORDER, 'New order'],
    [AppRoute.HISTORY, 'Order history'],
    [orderRoute(ORDER_ID), 'Order history'],
  ])('marks the current section in the main navigation on %s', (pathname, current) => {
    vi.mocked(usePathname).mockReturnValue(pathname);

    render(<AppShell>{null}</AppShell>);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link', { current: 'page' })).toHaveLength(1);
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveTextContent(current);
  });
});
