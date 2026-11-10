import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LoadingOrderHistory from './loading';

describe('LoadingOrderHistory', () => {
  it('tells assistive technology that the history is loading', () => {
    const { container } = render(<LoadingOrderHistory />);

    expect(screen.getByText('Loading orders…')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });
});
