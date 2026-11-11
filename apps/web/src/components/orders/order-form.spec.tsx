import { OrderType } from '@order-splitter/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorMessage, orderRoute } from '@/lib/constants';
import { portfolioOrder } from '@/test/fixtures';
import { createPortfolioOrderAction } from '@/server/actions';
import { OrderForm } from './order-form';

vi.mock('@/server/actions', () => ({ createPortfolioOrderAction: vi.fn() }));

const submitOrder = vi.mocked(createPortfolioOrderAction);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A successful action result; `replayed` is what the API reports for a repeated key. */
function placed(order = portfolioOrder(), replayed = false) {
  return { ok: true as const, data: { order, replayed } };
}

function renderForm() {
  const user = userEvent.setup();
  render(<OrderForm />);
  return { user };
}

/** An allocation input, e.g. cell('Symbol', 2) for the symbol of the second row. */
function cell(label: 'Symbol' | 'Weight %' | 'Market price (optional)', row: number) {
  return screen.getByRole('textbox', { name: `${label}, row ${row}` });
}

/** Checks the weight indicator's total, and its hint, which is the only part announced. */
function expectWeight(total: string, hint: string) {
  const totalLabel = screen.getByText('Total weight');
  expect(totalLabel.nextElementSibling).toHaveTextContent(total);
  expect(screen.getByRole('status')).toHaveTextContent(hint);
}

const rowCount = () => screen.getAllByRole('button', { name: /^Remove row/ }).length;
const splitButton = () => screen.getByRole('button', { name: 'Split order' });

/**
 * Waits for an error with no field at fault to be shown and focused. The form moves focus to the
 * message once it is unlocked, so editing before then could lose keystrokes to that focus move.
 */
async function errorShown() {
  const alert = await screen.findByRole('alert');
  await waitFor(() => expect(alert).toHaveFocus());
  return alert;
}

// Sample order plus an empty third row, submitted so that row 3 shows its errors.
async function submitWithEmptyThirdRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add stock' }));
  await user.click(splitButton());
  expect(cell('Symbol', 3)).toBeInvalid();
}

describe('OrderForm', () => {
  it('starts from a sample order with a complete total', () => {
    renderForm();

    expect(cell('Symbol', 1)).toHaveValue('AAPL');
    expect(cell('Weight %', 2)).toHaveValue('40');
    expect(screen.getByLabelText('Total amount (USD)')).toHaveValue('100');
    expectWeight('100%', 'Adds up to 100%');
  });

  it('places the order and shows the orders to place', async () => {
    const order = portfolioOrder();
    submitOrder.mockResolvedValue(placed(order));
    const { user } = renderForm();

    await user.click(splitButton());

    expect(await screen.findByRole('heading', { name: 'Orders to place' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View in history' })).toHaveAttribute(
      'href',
      orderRoute(order.id),
    );
    expect(screen.getByRole('rowheader', { name: 'AAPL' })).toBeInTheDocument();
    expect(submitOrder).toHaveBeenCalledWith(
      {
        orderType: OrderType.BUY,
        totalAmount: '100',
        portfolio: {
          allocations: [
            { symbol: 'AAPL', percent: '60' },
            { symbol: 'TSLA', percent: '40' },
          ],
        },
      },
      expect.stringMatching(UUID),
    );
  });

  it('sends the chosen order type, name and market prices', async () => {
    submitOrder.mockResolvedValue(placed());
    const { user } = renderForm();

    await user.click(screen.getByRole('radio', { name: 'SELL' }));
    await user.type(screen.getByLabelText(/Portfolio name/), '  Tech Tilt ');
    await user.type(cell('Market price (optional)', 1), '187.35');
    await user.click(splitButton());

    await waitFor(() => expect(submitOrder).toHaveBeenCalledOnce());
    expect(submitOrder.mock.calls[0]?.[0]).toEqual({
      orderType: OrderType.SELL,
      totalAmount: '100',
      portfolio: {
        name: 'Tech Tilt',
        allocations: [
          { symbol: 'AAPL', percent: '60', marketPrice: '187.35' },
          { symbol: 'TSLA', percent: '40' },
        ],
      },
    });
  });

  it('checks the form locally and does not submit it while a weight is invalid', async () => {
    const { user } = renderForm();

    await user.clear(cell('Weight %', 2));
    await user.type(cell('Weight %', 2), 'abc');
    expectWeight('60%', 'Enter a valid weight for every stock');

    await user.click(splitButton());

    expect(screen.getByRole('alert')).toHaveTextContent(ErrorMessage.INVALID_FORM);
    expect(cell('Weight %', 2)).toBeInvalid();
    expect(cell('Weight %', 2)).toHaveAccessibleDescription(/.+/);
    expect(cell('Weight %', 1)).toBeValid();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  it('shows a zero total while no weight is valid', async () => {
    const { user } = renderForm();

    await user.clear(cell('Weight %', 1));
    await user.clear(cell('Weight %', 2));

    expectWeight('0%', 'Enter a valid weight for every stock');
  });

  it('asks for 100% when every weight is valid but the total is not', async () => {
    const { user } = renderForm();

    await user.clear(cell('Weight %', 2));
    await user.type(cell('Weight %', 2), '30');

    expectWeight('90%', 'Must add up to 100%');
  });

  it('does not ask for 100% when the total is 100% but a weight is invalid', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Add stock' }));

    expectWeight('100%', 'Enter a valid weight for every stock');
  });

  it('shows the API message and puts its field errors on the fields they concern', async () => {
    submitOrder.mockResolvedValue({
      ok: false,
      message: 'Some allocations are too small to trade',
      errors: [
        { path: 'totalAmount', message: 'Too small to split' },
        { path: 'portfolio.allocations.1', message: 'TSLA quantity rounds down to zero' },
      ],
    });
    const { user } = renderForm();

    await user.click(splitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some allocations are too small to trade',
    );
    expect(screen.getByLabelText('Total amount (USD)')).toHaveAccessibleDescription(
      'Too small to split',
    );
    expect(screen.getByText('TSLA quantity rounds down to zero')).toBeInTheDocument();
  });

  it('shows that an order whose result could not be read was still submitted', async () => {
    submitOrder.mockResolvedValue({
      ok: false,
      message: ErrorMessage.ORDER_STATUS_UNKNOWN,
      errors: [],
    });
    const { user } = renderForm();

    await user.click(splitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(ErrorMessage.ORDER_STATUS_UNKNOWN);
  });

  it('retries with the same request key, and uses a new one once the order is edited', async () => {
    submitOrder.mockResolvedValue({
      ok: false,
      message: ErrorMessage.SERVICE_UNAVAILABLE,
      errors: [],
    });
    const { user } = renderForm();
    const submitAndWait = async (times: number) => {
      await user.click(splitButton());
      await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(times));
      await errorShown();
    };

    await submitAndWait(1);
    await submitAndWait(2);
    await user.type(screen.getByLabelText('Total amount (USD)'), '0');
    await submitAndWait(3);

    const [first, retry, edited] = submitOrder.mock.calls.map(([, key]) => key);
    expect(first).toMatch(UUID);
    expect(retry).toBe(first);
    expect(edited).toMatch(UUID);
    expect(edited).not.toBe(first);
  });

  it('keeps the key when an edit leaves the request the same', async () => {
    submitOrder.mockResolvedValue({ ok: false, message: 'Try again', errors: [] });
    const { user } = renderForm();

    await user.click(splitButton());
    await errorShown();
    // Edited, then written differently but meaning the same: 100.00 and aapl.
    await user.clear(screen.getByLabelText('Total amount (USD)'));
    await user.type(screen.getByLabelText('Total amount (USD)'), '100.00');
    await user.clear(cell('Symbol', 1));
    await user.type(cell('Symbol', 1), 'aapl');
    await user.click(splitButton());
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(2));

    const [first, second] = submitOrder.mock.calls.map(([, key]) => key);
    expect(second).toBe(first);
  });

  it('keeps the form and its key when the request itself fails', async () => {
    submitOrder.mockRejectedValueOnce(new Error('Failed to fetch'));
    submitOrder.mockResolvedValueOnce(placed());
    const { user } = renderForm();
    await user.clear(screen.getByLabelText('Total amount (USD)'));
    await user.type(screen.getByLabelText('Total amount (USD)'), '250');

    await user.click(splitButton());

    expect(await errorShown()).toHaveTextContent(ErrorMessage.SUBMIT_UNCONFIRMED);
    expect(screen.getByLabelText('Total amount (USD)')).toHaveValue('250');

    await user.click(splitButton());
    await screen.findByRole('heading', { name: 'Orders to place' });
    const [failed, resent] = submitOrder.mock.calls.map(([, key]) => key);
    expect(resent).toBe(failed);
  });

  it('sends the same order again with its key and says when the API already had it', async () => {
    const order = portfolioOrder();
    submitOrder.mockResolvedValueOnce(placed(order)).mockResolvedValueOnce(placed(order, true));
    const { user } = renderForm();

    await user.click(splitButton());
    await screen.findByRole('heading', { name: 'Orders to place' });
    expect(screen.queryByText(/Already placed/)).not.toBeInTheDocument();

    await user.click(splitButton());
    const heading = await screen.findByRole('heading', { name: 'Orders to place' });
    await waitFor(() => expect(heading).toHaveAccessibleDescription(/^Already placed/));
    const [first, again] = submitOrder.mock.calls.map(([, key]) => key);
    expect(again).toBe(first);
  });

  it('says an order was already placed when a resend follows an unconfirmed attempt', async () => {
    submitOrder
      .mockResolvedValueOnce({ ok: false, message: ErrorMessage.SUBMIT_UNCONFIRMED, errors: [] })
      .mockResolvedValueOnce(placed(portfolioOrder(), true));
    const { user } = renderForm();

    await user.click(splitButton());
    await errorShown();
    await user.click(splitButton());

    expect(await screen.findByText(/Already placed/)).toBeInTheDocument();
  });

  it('reuses the key of an earlier order when the form goes back to it', async () => {
    submitOrder.mockResolvedValue({
      ok: false,
      message: ErrorMessage.SUBMIT_UNCONFIRMED,
      errors: [],
    });
    const { user } = renderForm();
    const amount = () => screen.getByLabelText('Total amount (USD)');
    const submitAndWait = async (times: number) => {
      await user.click(splitButton());
      await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(times));
      await errorShown();
    };

    await submitAndWait(1);
    await user.clear(amount());
    await user.type(amount(), '200');
    await submitAndWait(2);
    await user.clear(amount());
    await user.type(amount(), '100');
    await submitAndWait(3);

    const [first, other, back] = submitOrder.mock.calls.map(([, key]) => key);
    expect(other).not.toBe(first);
    expect(back).toBe(first);
  });

  it('moves focus to the message when no field is at fault', async () => {
    submitOrder.mockRejectedValue(new Error('Failed to fetch'));
    const { user } = renderForm();

    await user.click(splitButton());

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('starts a new order after a reset, even with the same values', async () => {
    submitOrder.mockResolvedValue(placed());
    const { user } = renderForm();

    await user.click(splitButton());
    await screen.findByRole('heading', { name: 'Orders to place' });
    await user.click(screen.getByRole('button', { name: 'Reset to example' }));
    await user.click(splitButton());
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(2));

    const [first, afterReset] = submitOrder.mock.calls.map(([, key]) => key);
    expect(afterReset).not.toBe(first);
  });

  it('locks the form while the order is being placed', async () => {
    let finish: (value: Awaited<ReturnType<typeof createPortfolioOrderAction>>) => void = () => {};
    submitOrder.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { user } = renderForm();

    await user.click(splitButton());

    expect(await screen.findByRole('button', { name: 'Splitting…' })).toBeDisabled();
    expect(screen.getByLabelText('Total amount (USD)')).toBeDisabled();
    expect(cell('Weight %', 1)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove row 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add stock' })).toBeDisabled();

    finish(placed());
    await screen.findByRole('heading', { name: 'Orders to place' });
    expect(screen.getByLabelText('Total amount (USD)')).toBeEnabled();
  });

  it('moves focus to the first field with an error', async () => {
    const { user } = renderForm();
    await user.clear(cell('Weight %', 2));
    await user.type(cell('Weight %', 2), 'abc');

    await user.click(splitButton());

    await waitFor(() => expect(cell('Weight %', 2)).toHaveFocus());
  });

  it('moves focus to the result so it is announced', async () => {
    submitOrder.mockResolvedValue(placed());
    const { user } = renderForm();

    await user.click(splitButton());

    const heading = await screen.findByRole('heading', { name: 'Orders to place' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('links an error about the weights as a whole to every weight', async () => {
    const { user } = renderForm();
    await user.clear(cell('Weight %', 2));
    await user.type(cell('Weight %', 2), '30');

    await user.click(splitButton());

    for (const row of [1, 2]) {
      expect(cell('Weight %', row)).toBeInvalid();
      expect(cell('Weight %', row)).toHaveAccessibleDescription(/100/);
    }
    expect(cell('Symbol', 1)).toBeValid();
  });

  it('links an error about one stock to that stock’s weight', async () => {
    submitOrder.mockResolvedValue({
      ok: false,
      message: 'Some stocks are below the minimum order amount',
      errors: [
        { path: 'portfolio.allocations.1', message: '$0.40 allocated to TSLA is too small' },
      ],
    });
    const { user } = renderForm();

    await user.click(splitButton());

    await waitFor(() =>
      expect(cell('Weight %', 2)).toHaveAccessibleDescription(
        '$0.40 allocated to TSLA is too small',
      ),
    );
    expect(cell('Weight %', 2)).toHaveFocus();
    expect(cell('Weight %', 1)).toBeValid();
  });

  describe('removing a row', () => {
    it('moves the errors of later rows up with them', async () => {
      const { user } = renderForm();
      await submitWithEmptyThirdRow(user);

      await user.click(screen.getByRole('button', { name: 'Remove row 2' }));

      expect(rowCount()).toBe(2);
      expect(cell('Symbol', 1)).toHaveValue('AAPL');
      expect(cell('Symbol', 1)).toBeValid();
      expect(cell('Symbol', 2)).toHaveValue('');
      expect(cell('Symbol', 2)).toBeInvalid();
      expect(cell('Symbol', 2)).toHaveAccessibleDescription(/Symbol is required/);
      expect(cell('Weight %', 2)).toBeInvalid();
    });

    it('drops the errors of the row that was removed', async () => {
      const { user } = renderForm();
      await submitWithEmptyThirdRow(user);

      await user.click(screen.getByRole('button', { name: 'Remove row 3' }));

      expect(rowCount()).toBe(2);
      expect(screen.queryByText(/Symbol is required/)).not.toBeInTheDocument();
      for (const input of screen.getAllByRole('textbox')) expect(input).toBeValid();
    });

    it('keeps at least one row', async () => {
      const { user } = renderForm();

      await user.click(screen.getByRole('button', { name: 'Remove row 2' }));

      expect(screen.getByRole('button', { name: 'Remove row 1' })).toBeDisabled();
    });
  });

  it('resets to the example and clears errors and results', async () => {
    const { user } = renderForm();
    await submitWithEmptyThirdRow(user);

    await user.click(screen.getByRole('button', { name: 'Reset to example' }));

    expect(rowCount()).toBe(2);
    expect(cell('Symbol', 2)).toHaveValue('TSLA');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
