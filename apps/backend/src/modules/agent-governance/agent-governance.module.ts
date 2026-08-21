import { Module, forwardRef } from '@nestjs/common';
import { AgentGovernanceController } from './agent-governance.controller';
import { AgentGovernanceService } from './agent-governance.service';
import { CopilotService } from './copilot.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [forwardRef(() => KnowledgeModule)],
  controllers: [AgentGovernanceController],
  providers: [AgentGovernanceService, CopilotService],
  exports: [AgentGovernanceService, CopilotService],
})
export class AgentGovernanceModule {}
