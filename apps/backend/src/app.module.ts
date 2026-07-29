import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from './database/prisma.service';
import { PrismaModule } from './database/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { IncidentModule } from './modules/incidents/incident.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { CmdbModule } from './modules/cmdb/cmdb.module';
import { AiRouterModule } from './modules/ai-router/ai-router.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { AgentGovernanceModule } from './modules/agent-governance/agent-governance.module';
import { ProblemModule } from './modules/problems/problem.module';
import { ChangeModule } from './modules/changes/change.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    IncidentModule,
    WorkflowModule,
    CmdbModule,
    AiRouterModule,
    KnowledgeModule,
    AgentGovernanceModule,
    ProblemModule,
    ChangeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
