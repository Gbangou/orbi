'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AdminFeatureFlagsResponse,
} from '@mobilis/api';
import { describeRealtimeConnection } from '@mobilis/ui';
import { subscribeToAdminRealtime } from './admin-realtime';

type FeatureFlagsBoardProps = {
  featureFlags: AdminFeatureFlagsResponse;
};

async function fetchFeatureFlags() {
  const response = await fetch('/api/admin/feature-flags', {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Feature flags fetch failed');
  }

  return (await response.json()) as AdminFeatureFlagsResponse;
}

export function FeatureFlagsBoard({
  featureFlags,
}: FeatureFlagsBoardProps) {
  const [liveFeatureFlags, setLiveFeatureFlags] = useState(featureFlags);
  const [status, setStatus] = useState('Feature flags synchronisees.');
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);
  const [freshFlagIds, setFreshFlagIds] = useState<string[]>([]);
  const previousFlagsRef = useRef<AdminFeatureFlagsResponse['flags'] | null>(null);
  const previousRealtimeInfraRef =
    useRef<AdminFeatureFlagsResponse['infrastructure']['realtime'] | null>(null);

  const refreshFeatureFlags = useCallback(
    async (message = 'Feature flags resynchronisees.') => {
      try {
        const response = await fetchFeatureFlags();
        setLiveFeatureFlags(response);
        setStatus(message);
      } catch {
        setStatus("Impossible d'actualiser les feature flags.");
      }
    },
    [],
  );

  const summary = useMemo(() => {
    const enabled = liveFeatureFlags.flags.filter((flag) => flag.mode === 'on').length;
    const canary = liveFeatureFlags.flags.filter((flag) =>
      flag.mode.startsWith('canary:'),
    ).length;
    const restricted = liveFeatureFlags.flags.filter(
      (flag) => !flag.effectiveForAnonymous,
    ).length;

    return { enabled, canary, restricted };
  }, [liveFeatureFlags.flags]);

  useEffect(() => {
    const stream = subscribeToAdminRealtime({
      'trip.created': () =>
        void refreshFeatureFlags('Infra realtime mise a jour apres evenement trajet.'),
      'trip.updated': () =>
        void refreshFeatureFlags('Infra realtime mise a jour apres resynchronisation trajet.'),
      'ride-request.created': () =>
        void refreshFeatureFlags('Infra realtime mise a jour apres creation de demande.'),
      'ride-request.cancelled': () =>
        void refreshFeatureFlags('Infra realtime mise a jour apres annulation de demande.'),
      'support-ticket.updated': () =>
        void refreshFeatureFlags('Infra realtime mise a jour apres action support.'),
      'driver-onboarding.review-updated': () =>
        void refreshFeatureFlags('Feature flags resynchronisees apres decision ops.'),
      heartbeat: () =>
        setStatus(describeRealtimeConnection('admin-feature-flags', 'active')),
    });

    stream.onopen = () => {
      setStatus(describeRealtimeConnection('admin-feature-flags', 'connected'));
    };

    stream.onerror = () => {
      setStatus(describeRealtimeConnection('admin-feature-flags', 'reconnecting'));
    };

    return () => stream.close();
  }, [refreshFeatureFlags]);

  useEffect(() => {
    const previousFlags = previousFlagsRef.current;

    if (previousFlags) {
      const nextFreshFlagIds = liveFeatureFlags.flags
        .filter((flag) => !previousFlags.some((candidate) => candidate.flag === flag.flag))
        .map((flag) => flag.flag);
      const updatedFlag = liveFeatureFlags.flags.find((flag) => {
        const previousFlag = previousFlags.find((candidate) => candidate.flag === flag.flag);

        return (
          previousFlag
          && (previousFlag.mode !== flag.mode
            || previousFlag.effectiveForAnonymous !== flag.effectiveForAnonymous
            || previousFlag.allowlist.length !== flag.allowlist.length)
        );
      });

      if (nextFreshFlagIds.length > 0) {
        setFreshFlagIds(nextFreshFlagIds);
        setTransitionLabel(
          nextFreshFlagIds.length > 1
            ? `${nextFreshFlagIds.length} nouveaux flags viennent d entrer dans le rollout.`
            : 'Un nouveau flag vient d entrer dans le rollout.',
        );
      } else if (updatedFlag) {
        setFreshFlagIds([updatedFlag.flag]);
        setTransitionLabel(`Flag resynchronise: ${updatedFlag.flag} en mode ${updatedFlag.mode}.`);
      }
    }

    previousFlagsRef.current = liveFeatureFlags.flags;
  }, [liveFeatureFlags.flags]);

  useEffect(() => {
    const previousRealtimeInfra = previousRealtimeInfraRef.current;

    if (previousRealtimeInfra) {
      if (
        previousRealtimeInfra.activeStreams !== liveFeatureFlags.infrastructure.realtime.activeStreams
        || previousRealtimeInfra.publishedEvents !== liveFeatureFlags.infrastructure.realtime.publishedEvents
      ) {
        setTransitionLabel('Infra realtime resynchronisee avec de nouveaux volumes de flux.');
      } else if (
        previousRealtimeInfra.featureFlagMode !== liveFeatureFlags.infrastructure.realtime.featureFlagMode
        || previousRealtimeInfra.degraded !== liveFeatureFlags.infrastructure.realtime.degraded
      ) {
        setTransitionLabel('Le statut de l infrastructure realtime vient de changer.');
      }
    }

    previousRealtimeInfraRef.current = liveFeatureFlags.infrastructure.realtime;
  }, [liveFeatureFlags.infrastructure.realtime]);

  useEffect(() => {
    if (!transitionLabel) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransitionLabel(null);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [transitionLabel]);

  useEffect(() => {
    if (!freshFlagIds.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFreshFlagIds([]);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [freshFlagIds]);

  return (
    <section className="panel feature-flags-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Controlled Rollout</p>
          <h2>Feature Flags et canary releases</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Vue ops pour activer progressivement les modules critiques, reduire le
            blast radius des mises a jour et garder un rollout observable.
          </p>
          <div className="queue-actions">
            <button
              className="ghost-button"
              onClick={() => void refreshFeatureFlags()}
              type="button"
            >
              Actualiser
            </button>
            <span className="queue-status">{status}</span>
            {transitionLabel ? (
              <span className="queue-transition">{transitionLabel}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Flags on</span>
          <strong>{summary.enabled}</strong>
          <p>Modules pleinement actifs pour le rollout</p>
        </article>
        <article className="board-summary-card">
          <span>Canary</span>
          <strong>{summary.canary}</strong>
          <p>Fonctionnalites sous diffusion controlee</p>
        </article>
        <article className="board-summary-card">
          <span>Restreints</span>
          <strong>{summary.restricted}</strong>
          <p>Modules non exposes aux utilisateurs anonymes</p>
        </article>
      </div>

      <div className="feature-flags-grid">
        {liveFeatureFlags.flags.map((flag) => (
          <article
            className={`feature-flag-card ${
              freshFlagIds.includes(flag.flag) ? 'ticket-card-fresh' : ''
            }`}
            key={flag.flag}
          >
            {freshFlagIds.includes(flag.flag) ? (
              <span className="entity-transition-badge">Resync live</span>
            ) : null}
            <div className="ticket-topline">
              <span className="priority-badge priority-2">{flag.flag}</span>
              <span
                className={`phase-status ${
                  flag.mode === 'on'
                    ? 'phase-status-completed'
                    : flag.mode.startsWith('canary:')
                      ? 'phase-status-next'
                      : 'phase-status-planned'
                }`}
              >
                {flag.mode}
              </span>
            </div>
            <div className="feature-flag-rows">
              <div className="pricing-row">
                <span>Anonymous-safe</span>
                <strong>{flag.effectiveForAnonymous ? 'oui' : 'non'}</strong>
              </div>
              <div className="pricing-row">
                <span>Allowlist</span>
                <strong>
                  {flag.allowlist.length
                    ? `${flag.allowlist.length} acteur(s)`
                    : 'aucune'}
                </strong>
              </div>
            </div>
            {flag.allowlist.length ? (
              <div className="pricing-reasons">
                {flag.allowlist.map((actorId) => (
                  <span key={actorId}>{actorId}</span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="feature-runtime-card">
        <div className="ticket-topline">
          <span className="priority-badge priority-1">realtime infra</span>
          <span
            className={`phase-status ${
              liveFeatureFlags.infrastructure.realtime.degraded
                ? 'phase-status-next'
                : 'phase-status-completed'
            }`}
          >
            {liveFeatureFlags.infrastructure.realtime.adapter}
          </span>
        </div>
        <div className="feature-flag-rows">
          <div className="pricing-row">
            <span>Feature flag</span>
            <strong>
              {liveFeatureFlags.infrastructure.realtime.featureFlagMode}
            </strong>
          </div>
          <div className="pricing-row">
            <span>Shared backplane</span>
            <strong>
              {liveFeatureFlags.infrastructure.realtime.sharedBackplane
                ? 'oui'
                : 'non'}
            </strong>
          </div>
          <div className="pricing-row">
            <span>Active streams</span>
            <strong>{liveFeatureFlags.infrastructure.realtime.activeStreams}</strong>
          </div>
          <div className="pricing-row">
            <span>Published events</span>
            <strong>
              {liveFeatureFlags.infrastructure.realtime.publishedEvents}
            </strong>
          </div>
        </div>
        {liveFeatureFlags.infrastructure.realtime.degradeReason ? (
          <p className="feature-warning">
            {liveFeatureFlags.infrastructure.realtime.degradeReason}
          </p>
        ) : (
          <p className="feature-ok">
            Aucun signal de degradation sur le transport realtime.
          </p>
        )}
      </div>
    </section>
  );
}
