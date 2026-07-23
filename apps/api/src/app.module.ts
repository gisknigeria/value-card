import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { MerchantsModule } from './merchants/merchants.module';
import { PrismaModule } from './prisma/prisma.module';
import { VerificationModule } from './verification/verification.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { DependantsModule } from './dependants/dependants.module';
import { RenewalsModule } from './renewals/renewals.module';
import { MerchantAuthModule } from './merchant-auth/merchant-auth.module';
import { OffersModule } from './offers/offers.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AdminModule,
    DependantsModule,
    RenewalsModule,
    MerchantAuthModule,
    OffersModule,
    TransactionsModule,
    MerchantsModule,
    VerificationModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
