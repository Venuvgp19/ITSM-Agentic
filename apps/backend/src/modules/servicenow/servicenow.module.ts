import { Module } from '@nestjs/common';
import { IncidentModule } from '../incidents/incident.module';
import { ServiceNowController } from './servicenow.controller';
import { ServiceNowInternalController } from './servicenow-internal.controller';
import { ServiceNowService } from './servicenow.service';

@Module({
  imports: [IncidentModule],
  controllers: [ServiceNowController, ServiceNowInternalController],
  providers: [ServiceNowService],
  exports: [ServiceNowService],
})
export class ServiceNowModule {}
