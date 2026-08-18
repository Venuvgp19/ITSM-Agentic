import { Module, forwardRef } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { IncidentModule } from '../incidents/incident.module';
import { AiRouterModule } from '../ai-router/ai-router.module';
import { AgentGovernanceModule } from '../agent-governance/agent-governance.module';

@Module({
  imports: [IncidentModule, forwardRef(() => AiRouterModule), forwardRef(() => AgentGovernanceModule)],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
