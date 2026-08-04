import { Module } from '@nestjs/common';
import { IncidentModule } from '../incidents/incident.module';
import { AgentGovernanceModule } from '../agent-governance/agent-governance.module';
import { AiRouterController } from './ai-router.controller';
import { AiRouterService } from './ai-router.service';
import { LlmService } from './llm.service';

@Module({
  imports: [IncidentModule, AgentGovernanceModule],
  controllers: [AiRouterController],
  providers: [AiRouterService, LlmService],
  exports: [AiRouterService, LlmService],
})
export class AiRouterModule {}
