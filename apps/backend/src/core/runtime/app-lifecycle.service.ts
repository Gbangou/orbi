import { Injectable } from '@nestjs/common';

export type ApplicationLifecycleState =
  | 'starting'
  | 'ready'
  | 'draining'
  | 'stopped';

@Injectable()
export class AppLifecycleService {
  private state: ApplicationLifecycleState = 'starting';
  private lastTransitionAt = new Date().toISOString();
  private drainReason: string | null = null;

  markReady() {
    this.transitionTo('ready');
  }

  startDraining(reason = 'shutdown_signal') {
    this.drainReason = reason;
    this.transitionTo('draining');
  }

  markStopped() {
    this.transitionTo('stopped');
  }

  isReady() {
    return this.state === 'ready';
  }

  isLive() {
    return this.state !== 'stopped';
  }

  snapshot() {
    return {
      state: this.state,
      drainReason: this.drainReason,
      lastTransitionAt: this.lastTransitionAt,
    };
  }

  private transitionTo(nextState: ApplicationLifecycleState) {
    this.state = nextState;
    this.lastTransitionAt = new Date().toISOString();
  }
}
