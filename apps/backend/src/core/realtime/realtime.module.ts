import { Global, Module } from '@nestjs/common';
import { ConfigurableRealtimeTransport } from './configurable-realtime.transport';
import { InMemoryRealtimeTransport } from './in-memory-realtime.transport';
import { PostgresRealtimeTransport } from './postgres-realtime.transport';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { REALTIME_TRANSPORT } from './realtime.types';

@Global()
@Module({
  providers: [
    InMemoryRealtimeTransport,
    PostgresRealtimeTransport,
    ConfigurableRealtimeTransport,
    {
      provide: REALTIME_TRANSPORT,
      useExisting: ConfigurableRealtimeTransport,
    },
    RealtimeService,
    RealtimeGateway, // WebSocket gateway — complément fiable au SSE
  ],
  exports: [RealtimeService, RealtimeGateway],
})
export class RealtimeModule {}
