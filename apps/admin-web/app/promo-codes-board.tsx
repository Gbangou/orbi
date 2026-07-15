'use client';

import { useRef, useState } from 'react';
import type { PromoCodeItem } from '@orbi/api';
import { createAdminMutationHeaders, fetchAdminJson } from './admin-client-fetch';
import { formatAdminDateTime } from './admin-ops-kernel';
import { resolvePromoCodeFormPayload } from './promo-code-safety';

type PromoCodesBoardProps = {
  initialCodes: PromoCodeItem[];
};

function formatDiscountBps(bps: number) {
  return `${(bps / 100).toFixed(0)} %`;
}

function formatPromoDate(iso: string) {
  return formatAdminDateTime(iso, 'Date indisponible', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isExpired(validTo: string) {
  return new Date(validTo) < new Date();
}

async function fetchPromoCodes() {
  return fetchAdminJson<{ promoCodes: PromoCodeItem[] }>('/api/admin/promo-codes');
}

async function createPromoCode(payload: {
  code: string;
  description?: string;
  discountBps: number;
  maxUses?: number;
  validFrom: string;
  validTo: string;
  firstTripOnly: boolean;
}) {
  return fetchAdminJson<PromoCodeItem>('/api/admin/promo-codes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createAdminMutationHeaders(),
    },
    body: JSON.stringify(payload),
  });
}

async function deactivatePromoCode(promoCodeId: string) {
  return fetchAdminJson<{ promoCodeId: string; active: false }>(
    `/api/admin/promo-codes/${promoCodeId}`,
    {
      method: 'DELETE',
      headers: createAdminMutationHeaders(),
    },
  );
}

const emptyForm = {
  code: '',
  description: '',
  discountBps: '',
  maxUses: '',
  validFrom: '',
  validTo: '',
  firstTripOnly: true,
};

export function PromoCodesBoard({ initialCodes }: PromoCodesBoardProps) {
  const [codes, setCodes] = useState<PromoCodeItem[]>(initialCodes);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const promoCreateInFlightRef = useRef(false);
  const promoDeactivateInFlightRef = useRef(new Set<string>());

  async function refreshCodes() {
    try {
      const response = await fetchPromoCodes();
      setCodes(response.promoCodes);
    } catch {
      setStatus('Impossible de recharger les codes promo.');
    }
  }

  async function handleDeactivate(id: string) {
    if (promoDeactivateInFlightRef.current.has(id)) {
      return;
    }

    promoDeactivateInFlightRef.current.add(id);
    setBusyId(id);
    setStatus('Desactivation en cours...');
    try {
      await deactivatePromoCode(id);
      await refreshCodes();
      setStatus('Code promo desactive.');
    } catch {
      setStatus('La desactivation a echoue.');
    } finally {
      promoDeactivateInFlightRef.current.delete(id);
      setBusyId(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();

    if (promoCreateInFlightRef.current) {
      return;
    }

    const formPayload = resolvePromoCodeFormPayload(form);

    if (!formPayload.payload) {
      setStatus(formPayload.error);
      return;
    }

    promoCreateInFlightRef.current = true;
    setSubmitting(true);
    setStatus('Creation du code promo...');
    try {
      await createPromoCode(formPayload.payload);
      await refreshCodes();
      setForm(emptyForm);
      setShowForm(false);
      setStatus('Code promo cree avec succes.');
    } catch {
      setStatus('La creation du code promo a echoue. Verifiez que le code est unique.');
    } finally {
      promoCreateInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  const activeCodes = codes.filter((c) => c.active && !isExpired(c.validTo));
  const inactiveCodes = codes.filter((c) => !c.active || isExpired(c.validTo));

  return (
    <section className="panel ops-panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Marketing Ops</p>
          <h2>Codes promo</h2>
        </div>
        <div className="queue-meta">
          <p className="lede">
            Gestion des codes de reduction pour les premiers trajets et les campagnes
            marketing. Chaque code est audite a la creation et a la desactivation.
          </p>
          <div className="queue-actions">
            <button
              className="ghost-button"
              onClick={() => void refreshCodes()}
              type="button"
            >
              Actualiser
            </button>
            <button
              className={showForm ? 'ghost-button' : 'ticket-button ticket-button-success'}
              onClick={() => setShowForm((v) => !v)}
              type="button"
            >
              {showForm ? 'Annuler' : '+ Nouveau code'}
            </button>
            {status ? <span className="queue-status">{status}</span> : null}
          </div>
        </div>
      </div>

      <div className="board-summary-grid">
        <article className="board-summary-card">
          <span>Actifs</span>
          <strong>{activeCodes.length}</strong>
          <p>Codes valides et disponibles</p>
        </article>
        <article className="board-summary-card">
          <span>Inactifs / expires</span>
          <strong>{inactiveCodes.length}</strong>
          <p>Codes desactives ou hors validite</p>
        </article>
        <article className="board-summary-card">
          <span>Utilisations</span>
          <strong>{codes.reduce((sum, c) => sum + c.usedCount, 0)}</strong>
          <p>Total cumulatif sur tous les codes</p>
        </article>
      </div>

      {showForm ? (
        <form className="promo-create-form" onSubmit={(e) => void handleCreate(e)}>
          <h3>Nouveau code promo</h3>
          <div className="promo-form-grid">
            <label className="promo-form-field">
              <span>Code <abbr title="obligatoire">*</abbr></span>
              <input
                className="export-filter-input"
                disabled={submitting}
                maxLength={32}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="BIENVENUE20"
                required
                type="text"
                value={form.code}
              />
            </label>
            <label className="promo-form-field">
              <span>Remise (bps) <abbr title="obligatoire">*</abbr></span>
              <input
                className="export-filter-input"
                disabled={submitting}
                max={10000}
                min={1}
                onChange={(e) => setForm((f) => ({ ...f, discountBps: e.target.value }))}
                placeholder="2000 = 20%"
                required
                type="number"
                value={form.discountBps}
              />
            </label>
            <label className="promo-form-field">
              <span>Utilisations max</span>
              <input
                className="export-filter-input"
                disabled={submitting}
                min={1}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                placeholder="Illimite si vide"
                type="number"
                value={form.maxUses}
              />
            </label>
            <label className="promo-form-field">
              <span>Valide du <abbr title="obligatoire">*</abbr></span>
              <input
                className="export-filter-date"
                disabled={submitting}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                required
                type="date"
                value={form.validFrom}
              />
            </label>
            <label className="promo-form-field">
              <span>Valide jusqu au <abbr title="obligatoire">*</abbr></span>
              <input
                className="export-filter-date"
                disabled={submitting}
                onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
                required
                type="date"
                value={form.validTo}
              />
            </label>
            <label className="promo-form-field promo-form-field-wide">
              <span>Description</span>
              <input
                className="export-filter-input"
                disabled={submitting}
                maxLength={200}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Campagne premier trajet Ouagadougou"
                type="text"
                value={form.description}
              />
            </label>
            <label className="promo-form-field promo-form-check">
              <input
                checked={form.firstTripOnly}
                disabled={submitting}
                onChange={(e) => setForm((f) => ({ ...f, firstTripOnly: e.target.checked }))}
                type="checkbox"
              />
              <span>Premier trajet uniquement</span>
            </label>
          </div>
          <div className="promo-form-actions">
            <button
              className="ticket-button ticket-button-success"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Creation...' : 'Creer le code'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="promo-codes-list">
        {activeCodes.length === 0 && inactiveCodes.length === 0 ? (
          <article className="ticket-card">
            <h3>Aucun code promo</h3>
            <p>Creez un code pour demarrer une campagne de reduction.</p>
          </article>
        ) : null}

        {activeCodes.map((code) => (
          <article className="ticket-card promo-code-card" key={code.id}>
            <div className="ticket-topline">
              <span className="promo-code-badge">{code.code}</span>
              <span className="phase-status phase-status-completed">Actif</span>
              {code.firstTripOnly ? (
                <span className="promo-tag">1er trajet</span>
              ) : null}
            </div>
            <p className="promo-discount">{formatDiscountBps(code.discountBps)} de reduction</p>
            {code.description ? <p>{code.description}</p> : null}
            <div className="promo-meta-row">
              <span>Valide du {formatPromoDate(code.validFrom)} au {formatPromoDate(code.validTo)}</span>
              <span>
                {code.usedCount} utilisation(s)
                {code.maxUses ? ` / ${code.maxUses} max` : ' — illimitees'}
              </span>
            </div>
            <div className="ticket-actions">
              <button
                className="ticket-button ticket-button-danger"
                disabled={busyId === code.id}
                onClick={() => void handleDeactivate(code.id)}
                type="button"
              >
                {busyId === code.id ? 'Traitement...' : 'Desactiver'}
              </button>
            </div>
          </article>
        ))}

        {inactiveCodes.length > 0 ? (
          <>
            <h3 className="promo-section-label">Inactifs / expires</h3>
            {inactiveCodes.map((code) => (
              <article className="ticket-card promo-code-card promo-code-inactive" key={code.id}>
                <div className="ticket-topline">
                  <span className="promo-code-badge promo-code-badge-inactive">{code.code}</span>
                  <span className="phase-status phase-status-planned">
                    {isExpired(code.validTo) ? 'Expire' : 'Inactif'}
                  </span>
                  {code.firstTripOnly ? <span className="promo-tag">1er trajet</span> : null}
                </div>
                <p className="promo-discount">{formatDiscountBps(code.discountBps)} de reduction</p>
                {code.description ? <p>{code.description}</p> : null}
                <div className="promo-meta-row">
                  <span>{formatPromoDate(code.validFrom)} — {formatPromoDate(code.validTo)}</span>
                  <span>{code.usedCount} utilisation(s)</span>
                </div>
              </article>
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}
