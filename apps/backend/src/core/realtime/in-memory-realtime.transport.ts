import type { MessageEvent } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import {
  Observable,
  Subject,
  filter,
  finalize,
  interval,
  map,
  merge,
} from 'rxjs';
import {
  canReceiveRealtimeEvent,
  type RealtimeEvent,
  type RealtimeEventFilter,
  type RealtimeTransport,
} from './realtime.types';

@Injectable()
export class InMemoryRealtimeTransport implements RealtimeTransport {
  private readonly events$ = new Subject<RealtimeEvent>();
  private activeStreams = 0;
  private publishedEvents = 0;

  publish(event: RealtimeEvent) {
    this.publishedEvents += 1;
    this.events$.next(event);
  }

  stream(filterOptions: RealtimeEventFilter): Observable<MessageEvent> {
    this.activeStreams += 1;

    const eventStream = this.events$.pipe(
      filter((event) => canReceiveRealtimeEvent(event, filterOptions)),
      map((event) => ({
        data: event,
        type: event.type,
      })),
    );
    const heartbeatStream = interval(15_000).pipe(
      map(() => ({
        data: {
          type: 'heartbeat',
          createdAt: new Date().toISOString(),
        },
        type: 'heartbeat',
      })),
    );

    return merge(eventStream, heartbeatStream).pipe(
      finalize(() => {
        this.activeStreams = Math.max(0, this.activeStreams - 1);
      }),
    );
  }

  snapshot() {
    return {
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      activeStreams: this.activeStreams,
      publishedEvents: this.publishedEvents,
    };
  }
}
