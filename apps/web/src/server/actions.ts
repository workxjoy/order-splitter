'use server';

import {
  ApiHeader,
  createPortfolioOrderSchema,
  requestKeySchema,
  toFieldErrorList,
  type FieldError,
} from '@order-splitter/shared';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { AppRoute, ErrorMessage } from '@/lib/constants';
import {
  ApiError,
  portfolioOrdersApi,
  ResponseContractError,
  type CreatedOrder,
} from './api-client';

function failure(message: string, errors: FieldError[] = []): ActionResult<never> {
  return { ok: false, message, errors };
}

// Server actions can be called directly, so validate again before calling the API.
export async function createPortfolioOrderAction(
  input: unknown,
  requestKey: unknown,
): Promise<ActionResult<CreatedOrder>> {
  const request = createPortfolioOrderSchema.safeParse(input);
  if (!request.success) {
    return failure(ErrorMessage.INVALID_FORM, toFieldErrorList(request.error.issues));
  }
  const key = requestKeySchema.safeParse(requestKey);
  if (!key.success) {
    return failure(ErrorMessage.INVALID_FORM, [
      {
        path: ApiHeader.REQUEST_KEY,
        message: key.error.issues[0]?.message ?? ErrorMessage.INVALID_FORM,
      },
    ]);
  }

  try {
    const created = await portfolioOrdersApi.create(request.data, key.data);
    revalidatePath(AppRoute.HISTORY);
    return { ok: true, data: created };
  } catch (error) {
    if (error instanceof ApiError && error.problem) {
      return failure(error.problem.detail, error.problem.errors ?? []);
    }
    console.error('createPortfolioOrderAction failed', error);
    if (error instanceof ResponseContractError) {
      // The order was created. Asking the user to retry could create a duplicate.
      revalidatePath(AppRoute.HISTORY);
      return failure(ErrorMessage.ORDER_STATUS_UNKNOWN);
    }
    // A timeout or network error: the order may have been placed, so it is not "unavailable".
    return failure(
      error instanceof ApiError
        ? ErrorMessage.UNEXPECTED_RESPONSE
        : ErrorMessage.SUBMIT_UNCONFIRMED,
    );
  }
}
