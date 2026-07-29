import { Module } from '@nestjs/common';
import { ProblemService } from './problem.service';
import { ProblemController } from './problem.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProblemController],
  providers: [ProblemService],
  exports: [ProblemService],
})
export class ProblemModule {}
