import { MethodNotAllowedException } from '@nestjs/common';
import type { Response } from 'express';

const ALLOW_HEADER = 'Allow';
const METHOD_SEPARATOR = ', ';

// 405 with an Allow header listing the methods the resource supports.
export function methodNotAllowed(
  response: Response,
  allowed: readonly string[],
): MethodNotAllowedException {
  const methods = allowed.join(METHOD_SEPARATOR);
  response.setHeader(ALLOW_HEADER, methods);
  return new MethodNotAllowedException(`This resource supports ${methods}`);
}
