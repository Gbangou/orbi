import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { WalletTopUpService } from './wallet-topup.service';

@Module({
  imports: [PaymentsModule],
  controllers: [RidersController],
  providers: [RidersService, WalletTopUpService],
  exports: [WalletTopUpService],
})
export class RidersModule {}
