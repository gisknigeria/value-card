import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  MerchantAuthController,
  AdminMerchantController,
} from './merchant-auth.controller';
import { MerchantAuthService } from './merchant-auth.service';
import { MerchantGuard } from './merchant.guard';

@Module({
  imports: [AuthModule, AdminModule, PrismaModule],
  controllers: [MerchantAuthController, AdminMerchantController],
  providers: [MerchantAuthService, MerchantGuard],
  exports: [MerchantGuard, MerchantAuthService],
})
export class MerchantAuthModule {}
