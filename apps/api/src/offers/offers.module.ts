import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { MerchantAuthModule } from '../merchant-auth/merchant-auth.module';
import { MerchantOffersController, AdminOffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
  imports: [AuthModule, AdminModule, MerchantAuthModule],
  controllers: [MerchantOffersController, AdminOffersController],
  providers: [OffersService],
})
export class OffersModule {}
