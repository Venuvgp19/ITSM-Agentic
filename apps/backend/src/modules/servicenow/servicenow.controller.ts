import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ServiceNowService, ServiceNowWebhookPayload } from './servicenow.service';

@Controller('servicenow')
export class ServiceNowController {
  constructor(private readonly serviceNowService: ServiceNowService) {}

  // No @Public() here -- unchanged from before, so this stays behind the same
  // global JwtAuthGuard (app.module.ts) as every other non-@Public() route,
  // which requires an `Authorization: Bearer <token>` header but (via its
  // dev-testing fallback, see common/guards/jwt-auth.guard.ts) accepts ANY
  // non-empty bearer token without validating it. A dedicated ServiceNow-specific
  // secret/signature check was considered and explicitly deferred for the
  // current lab/demo environment (not an oversight) -- a real ServiceNow
  // "Outbound REST Message" configured with a static bearer token would already
  // satisfy this as-is. Do not expose this route to an untrusted network without
  // adding real signature verification first.
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleServiceNowWebhook(@Body() payload: ServiceNowWebhookPayload) {
    return this.serviceNowService.processOutboundWebhook(payload);
  }
}
