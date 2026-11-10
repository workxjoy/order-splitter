import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';

const HEALTH_STATUS_OK = 'ok';

const healthResponseSchema = z.object({
  status: z.literal(HEALTH_STATUS_OK),
  uptimeSeconds: z.number(),
});
type HealthResponse = z.output<typeof healthResponseSchema>;

@ApiTags('Health')
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiOkResponse({ standardSchema: healthResponseSchema })
  check(): HealthResponse {
    return { status: HEALTH_STATUS_OK, uptimeSeconds: Math.floor(process.uptime()) };
  }
}
