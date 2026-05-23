import { Global, Module } from '@nestjs/common';
import { PushTokenService } from './push-token.service';

@Global()
@Module({
  providers: [PushTokenService],
  exports: [PushTokenService],
})
export class PushTokenModule {}
