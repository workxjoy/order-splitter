import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  type ArgumentsHost,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ContentType, ErrorCode } from '@order-splitter/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AmountBelowMinimumException,
  RequestKeyReusedException,
  PortfolioOrderNotFoundException,
  QuantityBelowMinimumException,
} from '../../portfolio-orders/portfolio-orders.exceptions.js';
import { INTERNAL_ERROR_DETAIL } from '../constants.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { ValidationException } from '../exceptions/validation.exception.js';

const INSTANCE = '/api/v1/portfolio-orders';
const REQUEST_ID = 'req-1';

function createHost(headersSent = false) {
  const response = {
    headersSent,
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const request = { originalUrl: INSTANCE, id: REQUEST_ID };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

function render(exception: unknown) {
  const { host, response } = createHost();
  new HttpExceptionFilter().catch(exception, host);
  expect(response.type).toHaveBeenCalledWith(ContentType.PROBLEM_JSON);
  return {
    status: response.status.mock.calls[0]?.[0] as number,
    body: response.json.mock.calls[0]?.[0],
  };
}

describe('HttpExceptionFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders validation errors as 400 with field errors', () => {
    const errors = [{ path: 'totalAmount', message: 'Required' }];

    expect(render(new ValidationException(errors))).toEqual({
      status: HttpStatus.BAD_REQUEST,
      body: {
        type: 'about:blank',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'The request is invalid',
        code: ErrorCode.VALIDATION_FAILED,
        errors,
        instance: INSTANCE,
        requestId: REQUEST_ID,
      },
    });
  });

  it.each([
    [
      new PortfolioOrderNotFoundException('abc'),
      HttpStatus.NOT_FOUND,
      ErrorCode.PORTFOLIO_ORDER_NOT_FOUND,
    ],
    [
      new RequestKeyReusedException(),
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.REQUEST_KEY_REUSED,
    ],
    [
      new AmountBelowMinimumException([]),
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.AMOUNT_BELOW_MINIMUM,
    ],
    [
      new QuantityBelowMinimumException([]),
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.QUANTITY_BELOW_MINIMUM,
    ],
  ])('maps %s to its HTTP status and code', (error, status, code) => {
    const { status: actual, body } = render(error);

    expect(actual).toBe(status);
    expect(body).toMatchObject({ status, code, detail: error.message });
    expect(body).not.toHaveProperty('errors');
  });

  it('includes field errors carried by domain errors', () => {
    const fieldErrors = [{ path: 'portfolio.allocations.0', message: 'too small' }];

    expect(render(new QuantityBelowMinimumException(fieldErrors)).body).toMatchObject({
      errors: fieldErrors,
    });
  });

  it.each([
    [
      new BadRequestException('Unexpected token'),
      HttpStatus.BAD_REQUEST,
      ErrorCode.MALFORMED_REQUEST,
    ],
    [new NotFoundException('Cannot GET /nope'), HttpStatus.NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND],
    [new PayloadTooLargeException(), HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.PAYLOAD_TOO_LARGE],
    [new ThrottlerException(), HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED],
    [
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
      HttpStatus.I_AM_A_TEAPOT,
      ErrorCode.HTTP_ERROR,
    ],
  ])('maps framework exception %s', (exception, status, code) => {
    expect(render(exception)).toMatchObject({
      status,
      body: { status, code, detail: exception.message },
    });
  });

  it('hides unexpected errors behind a generic 500 and logs them', () => {
    const { status, body } = render(new TypeError('secret internal detail'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      detail: INTERNAL_ERROR_DETAIL,
      title: 'Internal Server Error',
    });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });

  it('does not write when the response has already been sent', () => {
    const { host, response } = createHost(true);

    new HttpExceptionFilter().catch(new Error('late'), host);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});
