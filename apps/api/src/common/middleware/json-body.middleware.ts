import {
  BadRequestException,
  Injectable,
  UnsupportedMediaTypeException,
  type NestMiddleware,
} from '@nestjs/common';
import { ContentType } from '@order-splitter/shared';
import express, { type NextFunction, type Request, type Response } from 'express';
import { DECIMAL_BODY_FIELDS, JSON_BODY_LIMIT, MALFORMED_JSON_DETAIL } from '../constants.js';

const METHODS_WITH_CONTENT: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);
// body-parser's error type for a body that is not valid JSON.
const PARSE_FAILED = 'entity.parse.failed';

// Third argument passed to a JSON.parse reviver (Node 21+).
interface JsonReviverContext {
  source?: string;
}

// Keep money fields as the exact text sent, so 10.0000000000000001 is not rounded to 10 before the
// decimal-places check. Their schemas accept strings; every other number is left alone.
function keepDecimalSource(key: string, value: unknown, context?: JsonReviverContext): unknown {
  return typeof value === 'number' && DECIMAL_BODY_FIELDS.has(key) && context?.source !== undefined
    ? context.source
    : value;
}

function isParseFailure(error: unknown): boolean {
  return (error as { type?: unknown } | undefined)?.type === PARSE_FAILED;
}

// Runs after the request-id and timing middleware, so bad bodies are still logged and timed.
@Injectable()
export class JsonBodyMiddleware implements NestMiddleware {
  // strict: false lets `null` or a bare string reach validation instead of failing as malformed.
  private readonly parse = express.json({
    limit: JSON_BODY_LIMIT,
    strict: false,
    reviver: keepDecimalSource,
  });

  use(req: Request, res: Response, next: NextFunction): void {
    // req.is() returns false for a non-JSON body and null when there is no body.
    if (METHODS_WITH_CONTENT.has(req.method) && req.is(ContentType.JSON) === false) {
      next(new UnsupportedMediaTypeException(`Request body must be ${ContentType.JSON}`));
      return;
    }
    // The parser's own message quotes part of the body, so it is not sent back.
    this.parse(req, res, (error?: unknown) => {
      next(isParseFailure(error) ? new BadRequestException(MALFORMED_JSON_DETAIL) : error);
    });
  }
}
