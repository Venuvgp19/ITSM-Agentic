import { Module } from '@nestjs/common';
import { AgentGovernanceController } from './agent-governance.controller';
import { AgentGovernanceService } from './agent-governance.service';

@Module({
  controllers: [AgentGovernanceController],
  providers: [AgentGovernanceService],
  exports: [AgentGovernanceService],
})
export class AgentGovernanceModule {}
