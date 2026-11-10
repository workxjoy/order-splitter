'use client';

import {
  createPortfolioOrderSchema,
  OrderLimits,
  OrderType,
  toFieldErrorList,
  type PortfolioOrderDto,
} from '@order-splitter/shared';
import { ArrowRight, CircleAlert, CircleCheck, Plus, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
// uuid also works on plain HTTP, where crypto.randomUUID is not available.
import { v4 as uuidv4 } from 'uuid';
import { OrderBreakdown } from './order-breakdown';
import { Input } from '@/components/ui/input';
import { ErrorMessage, orderRoute } from '@/lib/constants';
import {
  emptyAllocationRow,
  exampleFormValues,
  FieldPath,
  percentTotal,
  toCreateInput,
  toFieldErrors,
  withoutRowErrors,
  type AllocationRow,
  type FieldErrors,
  type OrderFormValues,
  type WeightTotal,
} from '@/lib/order-form';
import { createPortfolioOrderAction } from '@/server/actions';

const ORDER_TYPES = [OrderType.BUY, OrderType.SELL] as const;
const FULL_WEIGHT = Number(OrderLimits.PORTFOLIO_TOTAL_PERCENT);

const ALLOCATION_FIELDS = [
  { field: 'symbol', label: 'Symbol', placeholder: 'AAPL', inputMode: 'text' },
  { field: 'percent', label: 'Weight %', placeholder: '60', inputMode: 'decimal', trailing: '%' },
  {
    field: 'marketPrice',
    label: 'Market price (optional)',
    placeholder: 'Fixed price',
    inputMode: 'decimal',
    leading: '$',
  },
] as const satisfies readonly {
  field: keyof Omit<AllocationRow, 'id'>;
  label: string;
  placeholder: string;
  inputMode: 'text' | 'decimal';
  leading?: string;
  trailing?: string;
}[];

const ROW_COLUMNS = 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_2.5rem]';
const LABEL = 'mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200';

// Where focus goes once a submit has finished.
type FocusRequest = { target: 'firstError' | 'result' } | null;

function FieldError({ id, messages }: { id: string; messages: string[] | undefined }) {
  const message = messages?.[0];
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
      {message}
    </p>
  );
}

function WeightIndicator({ total, allValid, isComplete }: WeightTotal) {
  const tone = isComplete
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400';
  const hint = isComplete
    ? `Adds up to ${FULL_WEIGHT}%`
    : allValid
      ? `Must add up to ${FULL_WEIGHT}%`
      : 'Enter a valid weight for every stock';
  const filled = Math.min(Number(total ?? 0), FULL_WEIGHT);

  return (
    <div className="w-full sm:w-64">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">Total weight</span>
        <span className={`font-semibold tabular-nums ${tone}`}>{total ?? '0'}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${filled}%` }}
        />
      </div>
      {/* Only the hint is announced: it changes when the state changes, not on every keystroke. */}
      <p role="status" className={`mt-1.5 text-xs ${tone}`}>
        {hint}
      </p>
    </div>
  );
}

export function OrderForm() {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  // One request key per distinct request, kept until the form is reset. Sending a request again
  // (a retry, or going back to an order already sent) reuses its key, so the API returns the order
  // it already placed instead of placing a second one.
  const requestKeys = useRef(new Map<string, string>());

  // Stable ids for the server-rendered rows; rows added later get random ids.
  const [values, setValues] = useState<OrderFormValues>(() => {
    let sequence = 0;
    return exampleFormValues(() => `${formId}-row-${(sequence += 1)}`);
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [order, setOrder] = useState<PortfolioOrderDto | null>(null);
  const [alreadyPlaced, setAlreadyPlaced] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null);
  const [isPending, startTransition] = useTransition();

  const weightTotal = percentTotal(values.allocations);

  // Runs once the form is enabled again, since disabled fields cannot take focus.
  useEffect(() => {
    if (isPending || !focusRequest) return;
    if (focusRequest.target === 'result') {
      resultHeadingRef.current?.focus();
      return;
    }
    const firstInvalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (firstInvalid ?? formErrorRef.current)?.focus();
  }, [focusRequest, isPending]);

  function updateRow(index: number, field: keyof Omit<AllocationRow, 'id'>, value: string) {
    setValues((current) => ({
      ...current,
      allocations: current.allocations.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      ),
    }));
  }

  function removeRow(index: number) {
    setValues((current) => ({
      ...current,
      allocations: current.allocations.filter((_, i) => i !== index),
    }));
    // Errors are keyed by row index, so move them with the rows.
    setErrors((current) => withoutRowErrors(current, index));
  }

  function showErrors(message: string, fieldErrors: FieldErrors) {
    setFormError(message);
    setErrors(fieldErrors);
    setFocusRequest({ target: 'firstError' });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrder(null);
    setFocusRequest(null);
    const input = toCreateInput(values);
    const local = createPortfolioOrderSchema.safeParse(input);
    if (!local.success) {
      showErrors(ErrorMessage.INVALID_FORM, toFieldErrors(toFieldErrorList(local.error.issues)));
      return;
    }

    setFormError(null);
    setErrors({});
    // Compared in parsed form, so "100" and "100.00" count as the same request.
    const request = JSON.stringify(local.data);
    const key = requestKeys.current.get(request) ?? uuidv4();
    requestKeys.current.set(request, key);

    startTransition(async () => {
      try {
        const result = await createPortfolioOrderAction(input, key);
        if (result.ok) {
          setOrder(result.data.order);
          setAlreadyPlaced(result.data.replayed);
          setFocusRequest({ target: 'result' });
        } else {
          showErrors(result.message, toFieldErrors(result.errors));
        }
      } catch {
        // The request may or may not have reached the API. The form and its key are kept, so
        // sending it again is safe.
        showErrors(ErrorMessage.SUBMIT_UNCONFIRMED, {});
      }
    });
  }

  function reset() {
    setValues(exampleFormValues(() => uuidv4()));
    requestKeys.current.clear();
    setErrors({});
    setFormError(null);
    setOrder(null);
  }

  const errorId = (path: string) => `${formId}-${path}-error`;
  // `related` are group errors that also concern this field, such as weights not adding up.
  const fieldProps = (path: string, ...related: string[]) => {
    const withErrors = [path, ...related].filter((errorPath) => errors[errorPath]);
    return {
      'aria-invalid': withErrors.length > 0 ? true : undefined,
      'aria-describedby': withErrors.length > 0 ? withErrors.map(errorId).join(' ') : undefined,
    };
  };

  return (
    <div className="space-y-8">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="card overflow-hidden"
        aria-busy={isPending}
      >
        {/* Locked while the order is being placed, so errors and results match what was sent. */}
        <fieldset disabled={isPending} className="min-w-0 space-y-10 p-6 sm:p-8">
          <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
            <fieldset>
              <legend className={LABEL}>Order type</legend>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                {ORDER_TYPES.map((type) => {
                  const selected = values.orderType === type;
                  const selectedTone =
                    type === OrderType.BUY
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400';
                  return (
                    <label
                      key={type}
                      className={`flex h-8 cursor-pointer items-center justify-center rounded-md px-5 text-sm font-semibold transition has-disabled:cursor-not-allowed has-focus-visible:outline-2 has-focus-visible:outline-indigo-500 ${
                        selected
                          ? `bg-white shadow-sm dark:bg-slate-950 ${selectedTone}`
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="orderType"
                        value={type}
                        checked={selected}
                        onChange={() => setValues((current) => ({ ...current, orderType: type }))}
                        className="sr-only"
                      />
                      {type}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor={`${formId}-amount`} className={LABEL}>
                Total amount (USD)
              </label>
              <Input
                id={`${formId}-amount`}
                leading="$"
                trailing="USD"
                inputMode="decimal"
                autoComplete="off"
                className="numeric"
                value={values.totalAmount}
                onChange={(event) =>
                  setValues((current) => ({ ...current, totalAmount: event.target.value }))
                }
                {...fieldProps(FieldPath.TOTAL_AMOUNT)}
              />
              <FieldError
                id={errorId(FieldPath.TOTAL_AMOUNT)}
                messages={errors[FieldPath.TOTAL_AMOUNT]}
              />
            </div>

            <div>
              <label htmlFor={`${formId}-name`} className={LABEL}>
                Portfolio name <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                id={`${formId}-name`}
                autoComplete="off"
                placeholder="e.g. Balanced Growth"
                maxLength={OrderLimits.PORTFOLIO_NAME_MAX_LENGTH}
                value={values.portfolioName}
                onChange={(event) =>
                  setValues((current) => ({ ...current, portfolioName: event.target.value }))
                }
                {...fieldProps(FieldPath.PORTFOLIO_NAME)}
              />
              <FieldError
                id={errorId(FieldPath.PORTFOLIO_NAME)}
                messages={errors[FieldPath.PORTFOLIO_NAME]}
              />
            </div>
          </div>

          <section aria-labelledby={`${formId}-portfolio`} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id={`${formId}-portfolio`} className="text-base font-semibold">
                  Model portfolio
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Leave the market price empty to use the fixed price.
                </p>
              </div>
              <WeightIndicator {...weightTotal} />
            </div>

            <div
              aria-hidden
              className={`hidden gap-3 text-xs font-medium text-slate-500 sm:grid ${ROW_COLUMNS}`}
            >
              <span>Symbol</span>
              <span>Weight</span>
              <span>
                Market price <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <span />
            </div>

            <ol className="space-y-3">
              {values.allocations.map((row, index) => {
                const rowNumber = index + 1;
                return (
                  <li
                    key={row.id}
                    className={`grid grid-cols-1 items-start gap-2 sm:gap-3 ${ROW_COLUMNS}`}
                  >
                    {ALLOCATION_FIELDS.map((config) => {
                      const path = FieldPath.allocationField(index, config.field);
                      // Errors about the whole row, or about all the weights together, are fixed
                      // by changing a weight.
                      const related =
                        config.field === 'percent'
                          ? [FieldPath.allocation(index), FieldPath.ALLOCATIONS]
                          : [];
                      return (
                        <div key={config.field}>
                          <Input
                            aria-label={`${config.label}, row ${rowNumber}`}
                            autoComplete="off"
                            inputMode={config.inputMode}
                            placeholder={config.placeholder}
                            leading={'leading' in config ? config.leading : undefined}
                            trailing={'trailing' in config ? config.trailing : undefined}
                            className={config.field === 'symbol' ? 'uppercase' : 'numeric'}
                            value={row[config.field]}
                            onChange={(event) => updateRow(index, config.field, event.target.value)}
                            {...fieldProps(path, ...related)}
                          />
                          <FieldError id={errorId(path)} messages={errors[path]} />
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="btn-icon justify-self-end sm:justify-self-auto"
                      onClick={() => removeRow(index)}
                      disabled={values.allocations.length <= OrderLimits.MIN_ALLOCATIONS}
                      aria-label={`Remove row ${rowNumber}`}
                      title="Remove"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                    <div className="col-span-full -mt-1 empty:hidden">
                      <FieldError
                        id={errorId(FieldPath.allocation(index))}
                        messages={errors[FieldPath.allocation(index)]}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            <FieldError
              id={errorId(FieldPath.ALLOCATIONS)}
              messages={errors[FieldPath.ALLOCATIONS]}
            />

            <button
              type="button"
              className="btn-ghost -ml-2 px-2 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  allocations: [...current.allocations, emptyAllocationRow(uuidv4())],
                }))
              }
              disabled={values.allocations.length >= OrderLimits.MAX_ALLOCATIONS}
            >
              <Plus className="size-4" aria-hidden />
              Add stock
            </button>
          </section>

          {formError && (
            <div
              ref={formErrorRef}
              role="alert"
              tabIndex={-1}
              className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                {formError}
                <FieldError id={errorId('')} messages={errors['']} />
              </div>
            </div>
          )}
        </fieldset>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-8 dark:border-slate-800 dark:bg-slate-900/60">
          <button type="button" className="btn-ghost" onClick={reset} disabled={isPending}>
            <RotateCcw className="size-4" aria-hidden />
            Reset to example
          </button>
          <button type="submit" className="btn-primary sm:min-w-36" disabled={isPending}>
            {isPending ? 'Splitting…' : 'Split order'}
          </button>
        </div>
      </form>

      {order && (
        <section aria-labelledby={`${formId}-result`} className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 sm:px-8 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <CircleCheck
                  className="size-5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <h2
                  id={`${formId}-result`}
                  ref={resultHeadingRef}
                  tabIndex={-1}
                  aria-describedby={alreadyPlaced ? `${formId}-already-placed` : undefined}
                  className="text-base font-semibold outline-none"
                >
                  Orders to place
                </h2>
              </div>
              {alreadyPlaced && (
                <p
                  id={`${formId}-already-placed`}
                  className="mt-1 text-sm text-slate-500 dark:text-slate-400"
                >
                  Already placed: this is the order you sent before. Change it, or reset the form,
                  to place a new one.
                </p>
              )}
            </div>
            <Link
              href={orderRoute(order.id)}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              View in history
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="p-6 sm:p-8">
            <OrderBreakdown order={order} />
          </div>
        </section>
      )}
    </div>
  );
}
