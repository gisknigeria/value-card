import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MerchantAuthModule } from '../merchant-auth/merchant-auth.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [AuthModule, MerchantAuthModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
