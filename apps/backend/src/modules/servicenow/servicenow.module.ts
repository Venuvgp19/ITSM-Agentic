import { Module } from '@nestjs/common';
import { ServiceNowController } from './servicenow.controller';
import { ServiceNowService } from './servicenow.service';

@Module({
  controllers: [ServiceNowController],
  providers: [ServiceNowService],
  exports: [ServiceNowService],
})
export class ServiceNowModule {}
