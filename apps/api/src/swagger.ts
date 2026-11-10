import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ApiHeader, ContentType } from '@order-splitter/shared';
import { API_DOCS_JSON_PATH, API_DOCS_PATH } from './common/constants.js';

const API_TITLE = 'Portfolio Order Splitter API';
const API_DESCRIPTION =
  'Splits a model-portfolio investment into per-stock orders (amount and share quantity), says ' +
  'when to execute them (now during a market session, otherwise at the next session open) and ' +
  'keeps the order history in memory. Errors follow RFC 9457 (application/problem+json).';
const API_DOCUMENT_VERSION = '1.0.0';
const FIRST_ERROR_STATUS = 400;
const OPERATION_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const;

const COMMON_RESPONSE_HEADERS = {
  [ApiHeader.REQUEST_ID]: {
    description: 'Request id (the inbound one when it is a safe identifier); quote it in reports',
    schema: { type: 'string' },
  },
  [ApiHeader.RESPONSE_TIME]: {
    description: 'Server processing time in milliseconds, e.g. 1.234ms',
    schema: { type: 'string' },
  },
} as const;

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(API_TITLE)
      .setDescription(API_DESCRIPTION)
      .setVersion(API_DOCUMENT_VERSION)
      .build(),
  );
  describeResponses(document);
  SwaggerModule.setup(API_DOCS_PATH, app, document, { jsonDocumentUrl: API_DOCS_JSON_PATH });
}

// Nest documents every body as application/json. Errors are really application/problem+json, and
// every response has the request-id and timing headers.
function describeResponses(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of OPERATION_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!response || '$ref' in response) continue;
        response.headers = { ...COMMON_RESPONSE_HEADERS, ...response.headers };
        const body = response.content?.[ContentType.JSON];
        if (Number(status) >= FIRST_ERROR_STATUS && body) {
          response.content = { [ContentType.PROBLEM_JSON]: body };
        }
      }
    }
  }
}
