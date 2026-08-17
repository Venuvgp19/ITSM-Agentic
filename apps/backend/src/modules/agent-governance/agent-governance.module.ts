import { Module, forwardRef } from '@nestjs/common';
import { AgentGovernanceController } from './agent-governance.controller';
import { AgentGovernanceService } from './agent-governance.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [forwardRef(() => KnowledgeModule)],
  controllers: [AgentGovernanceController],
  providers: [AgentGovernanceService],
  exports: [AgentGovernanceService],
})
export class AgentGovernanceModule {}
