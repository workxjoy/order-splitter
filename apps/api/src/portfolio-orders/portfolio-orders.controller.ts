import { All, Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiHeader as ApiHeaderDoc,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import {
  ApiHeader,
  ApiResource,
  createPortfolioOrderSchema,
  listPortfolioOrdersQuerySchema,
  portfolioOrderIdParamsSchema,
  portfolioOrderListResponseSchema,
  portfolioOrderResponseSchema,
  errorResponseSchema,
  type CreatePortfolioOrderRequest,
  type ListPortfolioOrdersQuery,
  type PortfolioOrderIdParams,
  type PortfolioOrderListResponse,
  type PortfolioOrderResponse,
} from '@order-splitter/shared';
import type { Response } from 'express';
import { API_VERSION, versionedPath } from '../common/constants.js';
import { RequestKey } from '../common/decorators/request-key.decorator.js';
import { methodNotAllowed } from '../common/exceptions/method-not-allowed.exception.js';
import { PortfolioOrdersService } from './portfolio-orders.service.js';
import { toPaginationMeta, toPortfolioOrderDto } from './portfolio-order.mapper.js';

const REQUEST_REPLAYED_VALUE = 'true';
const COLLECTION_METHODS = ['GET', 'HEAD', 'POST'] as const;
const ORDER_METHODS = ['GET', 'HEAD'] as const;

@ApiTags('Portfolio orders')
@ApiTooManyRequestsResponse({
  description: 'Rate limit exceeded for this client; retry after the Retry-After seconds',
  standardSchema: errorResponseSchema,
  headers: { 'Retry-After': { description: 'Seconds to wait', schema: { type: 'integer' } } },
})
@Controller({ path: ApiResource.PORTFOLIO_ORDERS, version: API_VERSION })
export class PortfolioOrdersController {
  constructor(private readonly service: PortfolioOrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Split a model-portfolio order into per-stock orders',
    description:
      'Allocates the total amount across the portfolio by percentage, prices each stock (partner price ' +
      'first, otherwise the fixed price), computes share quantities at the configured precision and ' +
      'sets when to execute: now during a market session, otherwise at the next session open.',
  })
  @ApiHeaderDoc({
    name: ApiHeader.REQUEST_KEY,
    required: false,
    description:
      'Unique key per logical request. Retries with the same key and body return the original order.',
  })
  @ApiCreatedResponse({
    description: `Order created, or replayed when "${ApiHeader.REQUEST_REPLAYED}: true" is returned`,
    standardSchema: portfolioOrderResponseSchema,
    headers: {
      Location: { description: 'URL of the created order', schema: { type: 'string' } },
      [ApiHeader.REQUEST_REPLAYED]: {
        description: 'Present ("true") when an earlier order with the same key is returned',
        schema: { type: 'string', enum: [REQUEST_REPLAYED_VALUE] },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Malformed JSON or a body that breaks the request schema',
    standardSchema: errorResponseSchema,
  })
  @ApiPayloadTooLargeResponse({
    description: 'Body larger than 100 kB',
    standardSchema: errorResponseSchema,
  })
  @ApiUnsupportedMediaTypeResponse({
    description: 'Body is not application/json',
    standardSchema: errorResponseSchema,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Business rule violated (quantity below minimum, request key reused)',
    standardSchema: errorResponseSchema,
  })
  async create(
    @Body({ schema: createPortfolioOrderSchema }) body: CreatePortfolioOrderRequest,
    @RequestKey() requestKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PortfolioOrderResponse> {
    const { order, replayed } = await this.service.create(body, requestKey);
    response.location(versionedPath(ApiResource.PORTFOLIO_ORDERS, order.id));
    if (replayed) response.setHeader(ApiHeader.REQUEST_REPLAYED, REQUEST_REPLAYED_VALUE);
    return { data: toPortfolioOrderDto(order) };
  }

  @Get()
  @ApiOperation({ summary: 'List historic portfolio orders, newest first' })
  @ApiOkResponse({ standardSchema: portfolioOrderListResponseSchema })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters',
    standardSchema: errorResponseSchema,
  })
  async list(
    @Query({ schema: listPortfolioOrdersQuerySchema }) query: ListPortfolioOrdersQuery,
  ): Promise<PortfolioOrderListResponse> {
    const page = await this.service.list(query);
    return { data: page.items.map(toPortfolioOrderDto), meta: toPaginationMeta(page, query) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a portfolio order by id' })
  @ApiOkResponse({ standardSchema: portfolioOrderResponseSchema })
  @ApiBadRequestResponse({ description: 'Id is not a UUID', standardSchema: errorResponseSchema })
  @ApiNotFoundResponse({ description: 'Unknown id', standardSchema: errorResponseSchema })
  async getById(
    @Param({ schema: portfolioOrderIdParamsSchema }) params: PortfolioOrderIdParams,
  ): Promise<PortfolioOrderResponse> {
    const order = await this.service.getById(params.id);
    return { data: toPortfolioOrderDto(order) };
  }

  // Keep these last: any method not handled above gets a 405.
  @All()
  @ApiExcludeEndpoint()
  collectionMethodNotAllowed(@Res({ passthrough: true }) response: Response): never {
    throw methodNotAllowed(response, COLLECTION_METHODS);
  }

  @All(':id')
  @ApiExcludeEndpoint()
  orderMethodNotAllowed(@Res({ passthrough: true }) response: Response): never {
    throw methodNotAllowed(response, ORDER_METHODS);
  }
}
