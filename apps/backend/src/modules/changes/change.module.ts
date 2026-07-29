import { Module } from '@nestjs/common';
import { ChangeService } from './change.service';
import { ChangeController } from './change.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChangeController],
  providers: [ChangeService],
  exports: [ChangeService],
})
export class ChangeModule {}
