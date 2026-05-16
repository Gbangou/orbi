'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  type AdminDispatchSettingsResponse,
} from '@mobilis/api';
import { formatAdminDateTime } from './admin-ops-kernel';
import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from './admin-server-security';

type DispatchControlBoardProps = {
  initialSettings: AdminDispatchSettingsResponse;
};

type DispatchHistoryEntry = AdminDispatchSettingsResponse['history'][number];
type DispatchSettingsValues = NonNullable<DispatchHistoryEntry['after']>;
type DispatchHistoryTypeFilter = 'ALL' | 'RESETS' | 'PARTIAL_UPDATES';
type DispatchHistoryActorFilter = 'ALL' | 'OPS' | 'ADMIN';
type DispatchHistoryFieldFilter = 'ALL' | keyof DispatchSettingsValues;

const dispatchFieldLabels: Record<keyof DispatchSettingsValues, string> = {
  lookbackHours: 'Lookback',
  halfLifeHours: 'Half-life',
  declineCooldownMinutes: 'Cooldown refus',
  historyLimit: 'History limit',
};
const dispatchFieldKeys = Object.keys(dispatchFieldLabels) as Array<
  keyof DispatchSettingsValues
>;
const dispatchHistoryTypeFilterLabels: Record<
  DispatchHistoryTypeFilter,
  { label: string; description: string }
> = {
  ALL: {
    label: 'Tout',
    description: 'Vue complete de la timeline dispatch.',
  },
  RESETS: {
    label: 'Resets',
    description: 'Retour aux reglages backend par defaut.',
  },
  PARTIAL_UPDATES: {
    label: 'Updates partiels',
    description: 'Seulement les recalibrages qui ne touchent pas tous les champs.',
  },
};
const dispatchHistoryActorFilterLabels: Record<
  DispatchHistoryActorFilter,
  { label: string; description: string }
> = {
  ALL: {
    label: 'Tous acteurs',
    description: 'Inclut admins et ops.',
  },
  OPS: {
    label: 'Ops',
    description: 'Actions declenchees par les operations.',
  },
  ADMIN: {
    label: 'Admin',
    description: 'Actions declenchees par les administrateurs.',
  },
};
const dispatchHistoryFieldFilterLabels: Record<
  DispatchHistoryFieldFilter,
  { label: string; description: string }
> = {
  ALL: {
    label: 'Tous parametres',
    description: 'Inclut tous les reglages modifies dans la timeline.',
  },
  lookbackHours: {
    label: 'Lookback',
    description: 'Isole les changements sur la profondeur d historique analysee.',
  },
  halfLifeHours: {
    label: 'Half-life',
    description: 'Isole les ajustements sur la vitesse de decay des signaux.',
  },
  declineCooldownMinutes: {
    label: 'Cooldown refus',
    description: 'Isole les modifications de delai avant re-proposition.',
  },
  historyLimit: {
    label: 'History limit',
    description: 'Isole les changements du volume d evenements consultes.',
  },
};

function formatDispatchFieldValue(
  key: keyof DispatchSettingsValues,
  value: number | null | undefined,
) {
  if (value === null || value === undefined) {
    return '-';
  }

  if (key === 'lookbackHours' || key === 'halfLifeHours') {
    return `${value}h`;
  }

  if (key === 'declineCooldownMinutes') {
    return `${value}m`;
  }

  return String(value);
}

function resolveChangedDispatchFields(entry: DispatchHistoryEntry) {
  if (!entry.before || !entry.after) {
    return [];
  }

  return dispatchFieldKeys
    .filter((key) => entry.before?.[key] !== entry.after?.[key])
    .map((key) => ({
      key,
      label: dispatchFieldLabels[key],
      before: entry.before?.[key] ?? null,
      after: entry.after?.[key] ?? null,
    }));
}

function resolveActorRole(entry: DispatchHistoryEntry) {
  return entry.actor.role?.toUpperCase() ?? 'UNKNOWN';
}

async function fetchDispatchSettings() {
  const response = await fetch('/api/admin/dispatch-settings', {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Dispatch settings fetch failed');
  }

  return (await response.json()) as AdminDispatchSettingsResponse;
}

async function updateDispatchSettings(
  payload: {
    lookbackHours?: number;
    halfLifeHours?: number;
    declineCooldownMinutes?: number;
    historyLimit?: number;
    resetToDefaults?: boolean;
  },
) {
  const response = await fetch('/api/admin/dispatch-settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      [adminMutationHeaderName]: adminMutationHeaderValue,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Dispatch settings update failed');
  }

  return (await response.json()) as AdminDispatchSettingsResponse;
}

export function DispatchControlBoard({
  initialSettings,
}: DispatchControlBoardProps) {
  const [liveSettings, setLiveSettings] = useState(initialSettings);
  const [status, setStatus] = useState('Parametres dispatch synchronises.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] =
    useState<DispatchHistoryTypeFilter>('ALL');
  const [historyActorFilter, setHistoryActorFilter] =
    useState<DispatchHistoryActorFilter>('ALL');
  const [historyFieldFilter, setHistoryFieldFilter] =
    useState<DispatchHistoryFieldFilter>('ALL');
  const [formValues, setFormValues] = useState({
    lookbackHours: String(initialSettings.settings.lookbackHours),
    halfLifeHours: String(initialSettings.settings.halfLifeHours),
    declineCooldownMinutes: String(
      initialSettings.settings.declineCooldownMinutes,
    ),
    historyLimit: String(initialSettings.settings.historyLimit),
  });

  const syncFormWithSnapshot = useCallback(
    (snapshot: AdminDispatchSettingsResponse) => {
      setFormValues({
        lookbackHours: String(snapshot.settings.lookbackHours),
        halfLifeHours: String(snapshot.settings.halfLifeHours),
        declineCooldownMinutes: String(
          snapshot.settings.declineCooldownMinutes,
        ),
        historyLimit: String(snapshot.settings.historyLimit),
      });
    },
    [],
  );

  const refreshSettings = useCallback(
    async (message = 'Parametres dispatch actualises.') => {
      setIsSubmitting(true);

      try {
        const response = await fetchDispatchSettings();
        setLiveSettings(response);
        syncFormWithSnapshot(response);
        setStatus(message);
      } catch {
        setStatus("Impossible d'actualiser les reglages dispatch.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [syncFormWithSnapshot],
  );

  async function handleSubmit() {
    setIsSubmitting(true);
    setStatus('Enregistrement des reglages dispatch persistants...');

    try {
      const response = await updateDispatchSettings({
        lookbackHours: Number(formValues.lookbackHours),
        halfLifeHours: Number(formValues.halfLifeHours),
        declineCooldownMinutes: Number(formValues.declineCooldownMinutes),
        historyLimit: Number(formValues.historyLimit),
      });
      setLiveSettings(response);
      syncFormWithSnapshot(response);
      setStatus('Reglages dispatch persistants appliques.');
    } catch {
      setStatus("La mise a jour des reglages dispatch a echoue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset() {
    setIsSubmitting(true);
    setStatus('Retour aux reglages dispatch par defaut...');

    try {
      const response = await updateDispatchSettings({
        resetToDefaults: true,
      });
      setLiveSettings(response);
      syncFormWithSnapshot(response);
      setStatus('Reglages dispatch revenus aux valeurs de configuration.');
    } catch {
      setStatus('Le reset des reglages dispatch a echoue.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const updatedByLabel = liveSettings.settings.updatedBy
    ? `${liveSettings.settings.updatedBy.name ?? liveSettings.settings.updatedBy.id} (${liveSettings.settings.updatedBy.role ?? 'n/a'})`
    : 'Aucune action admin enregistree';
  const historyEntries = useMemo(
    () =>
      liveSettings.history.map((entry) => {
        const changedFields = resolveChangedDispatchFields(entry);

        return {
          entry,
          changedFields,
          actorRole: resolveActorRole(entry),
          isPartialUpdate:
            !entry.resetToDefaults &&
            changedFields.length > 0 &&
            changedFields.length < dispatchFieldKeys.length,
        };
      }),
    [liveSettings.history],
  );
  const typeFilterCounts = useMemo(
    () => ({
      ALL: historyEntries.length,
      RESETS: historyEntries.filter(({ entry }) => entry.resetToDefaults).length,
      PARTIAL_UPDATES: historyEntries.filter(
        ({ isPartialUpdate }) => isPartialUpdate,
      ).length,
    }),
    [historyEntries],
  );
  const actorFilterCounts = useMemo(
    () => ({
      ALL: historyEntries.length,
      OPS: historyEntries.filter(({ actorRole }) => actorRole === 'OPS').length,
      ADMIN: historyEntries.filter(({ actorRole }) => actorRole === 'ADMIN')
        .length,
    }),
    [historyEntries],
  );
  const fieldFilterCounts = useMemo(
    () => ({
      ALL: historyEntries.length,
      lookbackHours: historyEntries.filter(({ changedFields }) =>
        changedFields.some((field) => field.key === 'lookbackHours'),
      ).length,
      halfLifeHours: historyEntries.filter(({ changedFields }) =>
        changedFields.some((field) => field.key === 'halfLifeHours'),
      ).length,
      declineCooldownMinutes: historyEntries.filter(({ changedFields }) =>
        changedFields.some((field) => field.key === 'declineCooldownMinutes'),
      ).length,
      historyLimit: historyEntries.filter(({ changedFields }) =>
        changedFields.some((field) => field.key === 'historyLimit'),
      ).length,
    }),
    [historyEntries],
  );
  const filteredHistoryEntries = useMemo(
    () =>
      historyEntries.filter(({ entry, changedFields, actorRole, isPartialUpdate }) => {
        const matchesType =
          historyTypeFilter === 'ALL'
            ? true
            : historyTypeFilter === 'RESETS'
              ? entry.resetToDefaults
              : isPartialUpdate;
        const matchesActor =
          historyActorFilter === 'ALL' ? true : actorRole === historyActorFilter;
        const matchesField =
          historyFieldFilter === 'ALL'
            ? true
            : changedFields.some((field) => field.key === historyFieldFilter);

        return matchesType && matchesActor && matchesField;
      }),
    [historyActorFilter, historyEntries, historyFieldFilter, historyTypeFilter],
  );
  const activeHistoryFilters = useMemo(
    () =>
      [
        historyTypeFilter !== 'ALL'
          ? {
              id: 'type',
              label: `Type: ${dispatchHistoryTypeFilterLabels[historyTypeFilter].label}`,
            }
          : null,
        historyActorFilter !== 'ALL'
          ? {
              id: 'actor',
              label: `Acteur: ${dispatchHistoryActorFilterLabels[historyActorFilter].label}`,
            }
          : null,
        historyFieldFilter !== 'ALL'
          ? {
              id: 'field',
              label: `Parametre: ${dispatchHistoryFieldFilterLabels[historyFieldFilter].label}`,
            }
          : null,
      ].filter(Boolean) as Array<{ id: string; label: string }>,
    [historyActorFilter, historyFieldFilter, historyTypeFilter],
  );
  const hasActiveHistoryFilters = activeHistoryFilters.length > 0;

  function resetHistoryFilters() {
    setHistoryTypeFilter('ALL');
    setHistoryActorFilter('ALL');
    setHistoryFieldFilter('ALL');
  }

  return (
    <section className="panel dispatch-control-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Dispatch Control</p>
          <h2>Reglages persistants de la memoire dispatch</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Les ops peuvent recalibrer la memoire comportementale et conserver
            ces reglages apres redemarrage du backend.
          </p>
          <div className="queue-actions">
            <button
              className="ghost-button"
              disabled={isSubmitting}
              onClick={() => void refreshSettings()}
              type="button"
            >
              Actualiser
            </button>
            <span className="queue-status">{status}</span>
          </div>
        </div>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Source active</span>
          <strong>{liveSettings.settings.source}</strong>
          <p>DEFAULT suit la config, DATABASE_OVERRIDE persiste une surcharge admin</p>
        </article>
        <article className="board-summary-card">
          <span>Lookback</span>
          <strong>{liveSettings.settings.lookbackHours}h</strong>
          <p>Fenetre d historique analysee par chauffeur</p>
        </article>
        <article className="board-summary-card">
          <span>Decay</span>
          <strong>{liveSettings.settings.halfLifeHours}h</strong>
          <p>Demi-vie appliquee aux signaux comportementaux</p>
        </article>
        <article className="board-summary-card">
          <span>Cooldown refus</span>
          <strong>{liveSettings.settings.declineCooldownMinutes} min</strong>
          <p>Temps avant qu une offre explicitement refusee puisse revenir</p>
        </article>
      </div>

      <div className="dispatch-controls-grid">
        <article className="ticket-card dispatch-control-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-2">persisted</span>
            <span
              className={`phase-status ${
                liveSettings.settings.source === 'DATABASE_OVERRIDE'
                  ? 'phase-status-next'
                  : 'phase-status-completed'
              }`}
            >
              {liveSettings.settings.source}
            </span>
          </div>
          <h3>Calibrage ops</h3>
          <p>
            Ajustez la profondeur d historique, la vitesse de decay et le
            volume d evenements analyses pour adapter le dispatch au terrain.
          </p>

          <div className="dispatch-form-grid">
            <label className="control-field">
              <span>Lookback hours</span>
              <input
                max={336}
                min={6}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    lookbackHours: event.target.value,
                  }))
                }
                type="number"
                value={formValues.lookbackHours}
              />
            </label>
            <label className="control-field">
              <span>Half-life hours</span>
              <input
                max={168}
                min={1}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    halfLifeHours: event.target.value,
                  }))
                }
                type="number"
                value={formValues.halfLifeHours}
              />
            </label>
            <label className="control-field">
              <span>Decline cooldown min</span>
              <input
                max={240}
                min={1}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    declineCooldownMinutes: event.target.value,
                  }))
                }
                type="number"
                value={formValues.declineCooldownMinutes}
              />
            </label>
            <label className="control-field">
              <span>History limit</span>
              <input
                max={200}
                min={8}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    historyLimit: event.target.value,
                  }))
                }
                type="number"
                value={formValues.historyLimit}
              />
            </label>
          </div>

          <div className="dispatch-form-actions">
            <button
              className="ticket-button ticket-button-success"
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
              type="button"
            >
              Appliquer
            </button>
            <button
              className="ticket-button ticket-button-danger"
              disabled={isSubmitting}
              onClick={() => void handleReset()}
              type="button"
            >
              Revenir aux defaults
            </button>
          </div>
        </article>

        <article className="ticket-card dispatch-control-card">
          <div className="ticket-topline">
            <span className="priority-badge priority-1">memoire</span>
            <span className="phase-status phase-status-planned">trace</span>
          </div>
          <h3>Contexte actuel</h3>
          <div className="pricing-row">
            <span>Historique analyse</span>
            <strong>{liveSettings.settings.historyLimit} evenements max</strong>
          </div>
          <div className="pricing-row">
            <span>Derniere action admin</span>
            <strong>
              {liveSettings.settings.updatedAt
                ? formatAdminDateTime(liveSettings.settings.updatedAt)
                : 'jamais'}
            </strong>
          </div>
          <div className="pricing-row">
            <span>Acteur</span>
            <strong>{updatedByLabel}</strong>
          </div>
          <div className="pricing-row">
            <span>Lecture terrain</span>
            <strong>
              {liveSettings.settings.halfLifeHours <= 12
                ? 'signaux tres reactifs'
                : liveSettings.settings.halfLifeHours <= 24
                  ? 'equilibre ops'
                  : 'memoire plus conservative'}
            </strong>
          </div>
          <p className="dispatch-control-note">
            Les overrides admin sont maintenant persistants. Un retour aux
            defaults repasse sur la configuration backend tout en gardant la
            trace dans les audits.
          </p>
        </article>
      </div>

      <div className="dispatch-history-panel">
        <div className="ticket-topline">
          <span className="priority-badge priority-1">audit</span>
          <span className="queue-status">
            {filteredHistoryEntries.length} / {liveSettings.history.length}{' '}
            changement(s) visible(s)
          </span>
        </div>

        <div className="dispatch-history-summary">
          <div className="dispatch-history-active-filters">
            {hasActiveHistoryFilters ? (
              activeHistoryFilters.map((filter) => (
                <span
                  className="dispatch-history-pill dispatch-history-active-filter"
                  key={filter.id}
                >
                  {filter.label}
                </span>
              ))
            ) : (
              <span className="dispatch-control-note">
                Aucun filtre actif. La timeline affiche toute l histoire disponible.
              </span>
            )}
          </div>
          {hasActiveHistoryFilters ? (
            <button
              className="ghost-button dispatch-history-reset"
              onClick={resetHistoryFilters}
              type="button"
            >
              Reinitialiser les filtres
            </button>
          ) : null}
        </div>

        <div className="dispatch-history-toolbar">
          <div className="dispatch-history-filter-group">
            <span className="dispatch-history-filter-label">Type</span>
            <div
              aria-label="Filtres de type du journal dispatch"
              className="dispatch-history-filter-list"
              role="tablist"
            >
              {(Object.keys(
                dispatchHistoryTypeFilterLabels,
              ) as DispatchHistoryTypeFilter[]).map((filterKey) => {
                const filter = dispatchHistoryTypeFilterLabels[filterKey];

                return (
                  <button
                    aria-selected={historyTypeFilter === filterKey}
                    className={`dispatch-history-filter ${
                      historyTypeFilter === filterKey
                        ? 'dispatch-history-filter-active'
                        : ''
                    }`}
                    key={filterKey}
                    onClick={() => setHistoryTypeFilter(filterKey)}
                    role="tab"
                    type="button"
                  >
                    <strong>{filter.label}</strong>
                    <span>{typeFilterCounts[filterKey]} entree(s)</span>
                  </button>
                );
              })}
            </div>
            <p className="dispatch-history-filter-description">
              {dispatchHistoryTypeFilterLabels[historyTypeFilter].description}
            </p>
          </div>

          <div className="dispatch-history-filter-group">
            <span className="dispatch-history-filter-label">Acteur</span>
            <div
              aria-label="Filtres d acteur du journal dispatch"
              className="dispatch-history-filter-list"
              role="tablist"
            >
              {(Object.keys(
                dispatchHistoryActorFilterLabels,
              ) as DispatchHistoryActorFilter[]).map((filterKey) => {
                const filter = dispatchHistoryActorFilterLabels[filterKey];

                return (
                  <button
                    aria-selected={historyActorFilter === filterKey}
                    className={`dispatch-history-filter ${
                      historyActorFilter === filterKey
                        ? 'dispatch-history-filter-active'
                        : ''
                    }`}
                    key={filterKey}
                    onClick={() => setHistoryActorFilter(filterKey)}
                    role="tab"
                    type="button"
                  >
                    <strong>{filter.label}</strong>
                    <span>{actorFilterCounts[filterKey]} entree(s)</span>
                  </button>
                );
              })}
            </div>
            <p className="dispatch-history-filter-description">
              {dispatchHistoryActorFilterLabels[historyActorFilter].description}
            </p>
          </div>

          <div className="dispatch-history-filter-group">
            <span className="dispatch-history-filter-label">Parametre</span>
            <div
              aria-label="Filtres de parametre du journal dispatch"
              className="dispatch-history-filter-list"
              role="tablist"
            >
              {(Object.keys(
                dispatchHistoryFieldFilterLabels,
              ) as DispatchHistoryFieldFilter[]).map((filterKey) => {
                const filter = dispatchHistoryFieldFilterLabels[filterKey];

                return (
                  <button
                    aria-selected={historyFieldFilter === filterKey}
                    className={`dispatch-history-filter ${
                      historyFieldFilter === filterKey
                        ? 'dispatch-history-filter-active'
                        : ''
                    }`}
                    key={filterKey}
                    onClick={() => setHistoryFieldFilter(filterKey)}
                    role="tab"
                    type="button"
                  >
                    <strong>{filter.label}</strong>
                    <span>{fieldFilterCounts[filterKey]} entree(s)</span>
                  </button>
                );
              })}
            </div>
            <p className="dispatch-history-filter-description">
              {dispatchHistoryFieldFilterLabels[historyFieldFilter].description}
            </p>
          </div>
        </div>

        <div className="dispatch-history-grid">
          {filteredHistoryEntries.length ? (
            filteredHistoryEntries.map(({ entry, changedFields, isPartialUpdate }) => {
              return (
                <article className="ticket-card dispatch-history-card" key={entry.id}>
                  <div className="ticket-topline">
                    <span className="priority-badge priority-2">
                      {entry.resetToDefaults ? 'reset' : 'update'}
                    </span>
                    <span className="phase-status phase-status-planned">
                      {entry.source}
                    </span>
                  </div>
                  <h3>
                    {entry.resetToDefaults
                      ? 'Retour aux defaults backend'
                      : 'Surcharge admin persistante'}
                  </h3>
                  <p>
                    {entry.actor.name ?? entry.actor.id} ({entry.actor.role ?? 'n/a'})
                  </p>
                  {isPartialUpdate ? (
                    <span className="dispatch-history-pill">
                      Update partiel cible
                    </span>
                  ) : null}
                  {changedFields.length ? (
                    <>
                      <span className="dispatch-history-count">
                        {changedFields.length} champ
                        {changedFields.length > 1 ? 's modifies' : ' modifie'}
                      </span>
                      <div className="dispatch-history-metrics">
                        {changedFields.map((field) => (
                          <div className="pricing-row" key={field.key}>
                            <span>{field.label}</span>
                            <strong>
                              {formatDispatchFieldValue(field.key, field.before)} {'->'}{' '}
                              {formatDispatchFieldValue(field.key, field.after)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <span className="dispatch-control-note">
                      Aucun delta exploitable n a ete reconstruit pour cette entree.
                    </span>
                  )}
                  <span className="dispatch-control-note">
                    {formatAdminDateTime(entry.createdAt)}
                  </span>
                </article>
              );
            })
          ) : liveSettings.history.length ? (
            <article className="ticket-card dispatch-history-card">
              <span className="phase-status phase-status-planned">filtre actif</span>
              <h3>Aucune entree ne correspond</h3>
              <p>
                Ajustez les filtres de type, d acteur ou de parametre pour
                reafficher les changements dispatch.
              </p>
              {hasActiveHistoryFilters ? (
                <button
                  className="ghost-button dispatch-history-reset"
                  onClick={resetHistoryFilters}
                  type="button"
                >
                  Revenir a la vue complete
                </button>
              ) : null}
            </article>
          ) : (
            <article className="ticket-card dispatch-history-card">
              <span className="phase-status phase-status-completed">clean</span>
              <h3>Aucun changement admin enregistre</h3>
              <p>
                La timeline dispatch s alimentera des que des reglages seront
                modifies depuis cette console.
              </p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
