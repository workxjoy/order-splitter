import { STATUS_CODES } from 'node:http';
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  ContentType,
  ErrorCode,
  type FieldError,
  type ErrorResponse,
} from '@order-splitter/shared';
import type { Request, Response } from 'express';
import { DomainException, type DomainErrorCode } from '../exceptions/domain.exception.js';
import { INTERNAL_ERROR_DETAIL, PROBLEM_TYPE_DEFAULT } from '../constants.js';
import { ValidationException } from '../exceptions/validation.exception.js';

type ProblemBody = Omit<ErrorResponse, 'instance' | 'requestId'>;

const SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, HttpStatus> = {
  PORTFOLIO_ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUEST_KEY_REUSED: HttpStatus.UNPROCESSABLE_ENTITY,
  AMOUNT_BELOW_MINIMUM: HttpStatus.UNPROCESSABLE_ENTITY,
  QUANTITY_BELOW_MINIMUM: HttpStatus.UNPROCESSABLE_ENTITY,
};

// Exceptions thrown by Nest or Express themselves.
const HTTP_EXCEPTION_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.MALFORMED_REQUEST,
  [HttpStatus.NOT_FOUND]: ErrorCode.ROUTE_NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

// Every error is sent as application/problem+json. Details of 5xx errors are only logged.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    this.respond(exception, http.getRequest<Request>(), http.getResponse<Response>());
  }

  // Also called from setupApp for paths outside the Nest router.
  respond(exception: unknown, request: Request, response: Response): void {
    const requestId = typeof request.id === 'string' ? request.id : undefined;
    const body = this.describe(exception);

    if (body.status >= SERVER_ERROR_STATUS) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    }
    if (response.headersSent) return;

    const problem: ErrorResponse = { ...body, instance: request.originalUrl, requestId };
    response.status(problem.status).type(ContentType.PROBLEM_JSON).json(problem);
  }

  private describe(exception: unknown): ProblemBody {
    if (exception instanceof ValidationException) {
      return problem(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        exception.message,
        exception.fieldErrors,
      );
    }
    if (exception instanceof DomainException) {
      return problem(
        DOMAIN_ERROR_STATUS[exception.code],
        exception.code,
        exception.message,
        exception.fieldErrors,
      );
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return problem(
        status,
        HTTP_EXCEPTION_CODE[status] ?? ErrorCode.HTTP_ERROR,
        exception.message,
      );
    }
    return problem(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      INTERNAL_ERROR_DETAIL,
    );
  }
}

function problem(
  status: number,
  code: ErrorCode,
  detail: string,
  fieldErrors: readonly FieldError[] = [],
): ProblemBody {
  return {
    type: PROBLEM_TYPE_DEFAULT,
    title: STATUS_CODES[status] ?? String(status),
    status,
    detail,
    code,
    ...(fieldErrors.length > 0 && { errors: [...fieldErrors] }),
  };
}
