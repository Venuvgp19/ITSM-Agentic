import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ServiceNowService, ServiceNowWebhookPayload } from './servicenow.service';

@Controller('servicenow')
export class ServiceNowController {
  constructor(private readonly serviceNowService: ServiceNowService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleServiceNowWebhook(@Body() payload: ServiceNowWebhookPayload) {
    return this.serviceNowService.processOutboundWebhook(payload);
  }
}
