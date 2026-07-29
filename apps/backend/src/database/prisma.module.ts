import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SingleDatabaseService } from './single-db.service';

@Global()
@Module({
  providers: [PrismaService, SingleDatabaseService],
  exports: [PrismaService, SingleDatabaseService],
})
export class PrismaModule {}
