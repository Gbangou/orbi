import { Global, Module } from '@nestjs/common';
import { ConfigurableRealtimeTransport } from './configurable-realtime.transport';
import { InMemoryRealtimeTransport } from './in-memory-realtime.transport';
import { RealtimeService } from './realtime.service';
import { REALTIME_TRANSPORT } from './realtime.types';

@Global()
@Module({
  providers: [
    InMemoryRealtimeTransport,
    ConfigurableRealtimeTransport,
    {
      provide: REALTIME_TRANSPORT,
      useExisting: ConfigurableRealtimeTransport,
    },
    RealtimeService,
  ],
  exports: [RealtimeService],
})
export class RealtimeModule {}
