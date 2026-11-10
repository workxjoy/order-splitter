import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader, requestKeySchema } from '@order-splitter/shared';
import type { Request } from 'express';
import { ValidationException } from '../exceptions/validation.exception.js';

// Optional Request-Key header, validated.
export const RequestKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const header = context.switchToHttp().getRequest<Request>().header(ApiHeader.REQUEST_KEY);
    if (header === undefined) return undefined;

    const result = requestKeySchema.safeParse(header);
    if (!result.success) {
      throw new ValidationException(
        result.error.issues.map((issue) => ({
          path: ApiHeader.REQUEST_KEY,
          message: issue.message,
        })),
      );
    }
    return result.data;
  },
);
