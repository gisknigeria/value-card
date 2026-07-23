import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { RenewalsController, AdminRenewalsController } from './renewals.controller';
import { RenewalsService } from './renewals.service';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, AdminModule],
  controllers: [RenewalsController, AdminRenewalsController],
  providers: [RenewalsService],
})
export class RenewalsModule {}
