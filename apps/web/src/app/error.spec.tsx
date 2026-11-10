import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorMessage } from '@/lib/constants';
import ErrorPage from './error';

describe('ErrorPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('explains the failure, logs it and retries by loading the page again', async () => {
    const error = Object.assign(new Error('API unreachable'), { digest: '1234567' });
    const retry = vi.fn();

    render(<ErrorPage error={error} retry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(ErrorMessage.SERVICE_UNAVAILABLE);
    expect(screen.getByText('Reference: 1234567')).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith(error);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('omits the reference when the error has no digest', () => {
    render(<ErrorPage error={new Error('API unreachable')} retry={vi.fn()} />);

    expect(screen.queryByText(/^Reference:/)).not.toBeInTheDocument();
  });
});
