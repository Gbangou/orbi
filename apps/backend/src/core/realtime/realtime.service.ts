import { Inject, Injectable } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { takeUntil, timer } from 'rxjs';
import { FeatureFlagsService } from '../runtime/feature-flags.service';
import {
  REALTIME_TRANSPORT,
  type RealtimeEvent,
  type RealtimeEventFilter,
  type RealtimeTransport,
} from './realtime.types';

@Injectable()
export class RealtimeService {
  private publishSequence = 0;

  constructor(
    @Inject(REALTIME_TRANSPORT)
    private readonly transport: RealtimeTransport,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  publish(
    event: Omit<RealtimeEvent, 'id' | 'createdAt'> & {
      createdAt?: string;
    },
  ) {
    const createdAt = event.createdAt ?? new Date().toISOString();
    const sequence = this.publishSequence++;

    this.transport.publish({
      ...event,
      id: `${event.channel}:${event.type}:${event.entityId}:${createdAt}:${sequence}`,
      createdAt,
    });
  }

  stream(filterOptions: RealtimeEventFilter): Observable<MessageEvent> {
    const enabled = this.featureFlagsService.isEnabled('realtime', {
      actorId: filterOptions.actorId,
    });

    if (!enabled) {
      throw new ServiceUnavailableException(
        'Realtime is temporarily disabled for this actor during controlled rollout.',
      );
    }

    const stream = this.transport.stream(filterOptions);
    const sessionExpiresAt = filterOptions.sessionExpiresAt;

    if (!sessionExpiresAt) {
      return stream;
    }

    const expiresInMs = Math.max(0, sessionExpiresAt.getTime() - Date.now());

    return stream.pipe(takeUntil(timer(expiresInMs)));
  }

  snapshot() {
    const delegateSnapshot = this.transport.snapshot();

    return {
      ...delegateSnapshot,
      featureFlagMode: this.featureFlagsService.getMode('realtime'),
      featureFlagEnabled: this.featureFlagsService.isEnabled('realtime'),
    };
  }
}
