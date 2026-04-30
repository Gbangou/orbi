import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

const supportedFlags = [
  'payments',
  'pricing',
  'realtime',
  'driverOnboarding',
  'voice',
] as const;

export type FeatureFlagName = (typeof supportedFlags)[number];

type FeatureFlagContext = {
  actorId?: string | null;
};

export type FeatureFlagSnapshot = {
  flag: FeatureFlagName;
  mode: string;
  allowlist: string[];
};

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(flag: FeatureFlagName, context: FeatureFlagContext = {}) {
    const rollout = this.getRollout(flag);
    const actorId = context.actorId?.trim() || null;

    if (rollout === 'on') {
      return true;
    }

    if (rollout === 'off') {
      return this.getAllowlist(flag).includes(actorId ?? '');
    }

    if (rollout.startsWith('canary:')) {
      const percentage = Number.parseInt(rollout.split(':')[1] ?? '0', 10);

      if (this.getAllowlist(flag).includes(actorId ?? '')) {
        return true;
      }

      if (!actorId) {
        return false;
      }

      return this.computeStableBucket(flag, actorId) < percentage;
    }

    return false;
  }

  getMode(flag: FeatureFlagName) {
    return this.getRollout(flag);
  }

  snapshot(): FeatureFlagSnapshot[] {
    return supportedFlags.map((flag) => ({
      flag,
      mode: this.getRollout(flag),
      allowlist: this.getAllowlist(flag),
    }));
  }

  private getRollout(flag: FeatureFlagName) {
    const rawValue = this.configService.get<string>(`featureFlags.${flag}`);
    const normalized = rawValue?.trim().toLowerCase() ?? 'off';

    if (normalized === 'on' || normalized === 'off') {
      return normalized;
    }

    if (/^canary:(\d|[1-9]\d|100)$/.test(normalized)) {
      return normalized;
    }

    return 'off';
  }

  private getAllowlist(flag: FeatureFlagName) {
    return (
      this.configService.get<string[]>(`featureFlags.${flag}Allowlist`) ?? []
    );
  }

  private computeStableBucket(flag: FeatureFlagName, actorId: string) {
    const digest = createHash('sha256')
      .update(`${flag}:${actorId}`)
      .digest('hex')
      .slice(0, 8);

    return Number.parseInt(digest, 16) % 100;
  }
}
