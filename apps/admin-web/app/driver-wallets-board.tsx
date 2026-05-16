'use client';

import { useRef, useState } from 'react';
import {
  type AdminDriverPayoutResponse,
  type AdminDriverWalletRecoveryAdjustmentResponse,
  type AdminDriverWalletsResponse,
} from '@mobilis/api';
import {
  adminMutationHeaderName,
  adminMutationHeaderValue,
} from './admin-server-security';
import { formatAdminDateTime } from './admin-ops-kernel';

type DriverWalletsBoardProps = {
  wallets: AdminDriverWalletsResponse;
};

function formatMoney(amount: number, currency = 'XOF') {
  return `${currency} ${Math.round(amount).toLocaleString('fr-FR')}`;
}

async function postAdminMutation<TResponse>(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [adminMutationHeaderName]: adminMutationHeaderValue,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Admin mutation failed');
  }

  return (await response.json()) as TResponse;
}

export function DriverWalletsBoard({ wallets }: DriverWalletsBoardProps) {
  const [summaryState, setSummaryState] = useState(wallets.summary);
  const [walletState, setWalletState] = useState(wallets.wallets);
  const [statusByWalletId, setStatusByWalletId] = useState<
    Record<string, string>
  >({});
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const mutationInFlightRef = useRef(new Set<string>());

  function beginMutation(key: string) {
    if (mutationInFlightRef.current.has(key)) {
      return false;
    }

    mutationInFlightRef.current.add(key);
    return true;
  }

  function endMutation(key: string) {
    mutationInFlightRef.current.delete(key);
  }

  async function preparePayout(walletId: string) {
    const mutationKey = `prepare:${walletId}`;

    if (!beginMutation(mutationKey)) {
      return;
    }

    setStatusByWalletId((current) => ({
      ...current,
      [walletId]: 'Preparation payout...',
    }));

    try {
      const response = await postAdminMutation<AdminDriverPayoutResponse>(
        `/api/admin/driver-wallets/${walletId}/payouts/prepare`,
      );

      setWalletState((current) =>
        current.map((wallet) =>
          wallet.id === walletId
            ? {
                ...wallet,
                preparedPayout: {
                  id: response.payout.id,
                  amount: response.payout.amount,
                  currency: response.payout.currency,
                  status: response.payout.status,
                  reference: response.payout.reference,
                  notes: response.payout.notes,
                  preparedAt: response.payout.preparedAt,
                },
                recentPayouts: [
                  response.payout,
                  ...wallet.recentPayouts.filter(
                    (payout) => payout.id !== response.payout.id,
                  ),
                ].slice(0, 5),
              }
            : wallet,
        ),
      );
      setStatusByWalletId((current) => ({
        ...current,
        [walletId]:
          response.action === 'existing_prepared_payout'
            ? 'Payout deja prepare.'
            : 'Payout prepare pour paiement terrain.',
      }));
    } catch {
      setStatusByWalletId((current) => ({
        ...current,
        [walletId]: "Le payout n'a pas pu etre prepare.",
      }));
    } finally {
      endMutation(mutationKey);
    }
  }

  async function markPayoutPaid(walletId: string, payoutId: string) {
    const mutationKey = `paid:${payoutId}`;

    if (!beginMutation(mutationKey)) {
      return;
    }

    setStatusByWalletId((current) => ({
      ...current,
      [walletId]: 'Marquage paiement...',
    }));

    try {
      const response = await postAdminMutation<AdminDriverPayoutResponse>(
        `/api/admin/driver-payouts/${payoutId}/paid`,
      );

      setWalletState((current) =>
        current.map((wallet) =>
          wallet.id === walletId
            ? {
                ...wallet,
                balance:
                  response.action === 'paid' ||
                  response.action === 'already_paid'
                    ? Math.max(0, wallet.balance - response.payout.amount)
                    : wallet.balance,
                preparedPayout: null,
                recentPayouts: [
                  response.payout,
                  ...wallet.recentPayouts.filter(
                    (payout) => payout.id !== response.payout.id,
                  ),
                ].slice(0, 5),
              }
            : wallet,
        ),
      );
      setStatusByWalletId((current) => ({
        ...current,
        [walletId]:
          response.action === 'paid' || response.action === 'already_paid'
            ? 'Payout marque comme paye.'
            : 'Payout deja finalise.',
      }));
    } catch {
      setStatusByWalletId((current) => ({
        ...current,
        [walletId]: "Le payout n'a pas pu etre marque paye.",
      }));
    } finally {
      endMutation(mutationKey);
    }
  }

  async function recordRecovery(walletId: string, recoveryDue: number) {
    const mutationKey = `recovery:${walletId}`;

    if (!beginMutation(mutationKey)) {
      return;
    }

    setStatusByWalletId((current) => ({
      ...current,
      [walletId]: 'Recouvrement enregistrement...',
    }));

    try {
      const response =
        await postAdminMutation<AdminDriverWalletRecoveryAdjustmentResponse>(
          `/api/admin/driver-wallets/${walletId}/recovery-adjustments`,
          {
            amount: recoveryDue,
            notes: 'Recouvrement terrain confirme depuis la console ops.',
            idempotencyKey: `recovery-${walletId}-${Math.round(recoveryDue)}`,
          },
      );

      setSummaryState((current) => {
        const previousWallet = walletState.find((wallet) => wallet.id === walletId);
        const previousRecoveryDue = previousWallet?.recoveryDue ?? recoveryDue;
        const nextRecoveryDue = response.wallet.recoveryDue;

        return {
          ...current,
          recoveryWalletCount:
            previousRecoveryDue > 0 && nextRecoveryDue === 0
              ? Math.max(0, current.recoveryWalletCount - 1)
              : current.recoveryWalletCount,
          totalBalance:
            current.totalBalance + response.transaction.amount,
          totalRecoveryDue: Math.max(
            0,
            current.totalRecoveryDue - (previousRecoveryDue - nextRecoveryDue),
          ),
        };
      });
      setWalletState((current) =>
        current.map((wallet) =>
          wallet.id === walletId
            ? {
                ...wallet,
                balance: response.wallet.balance,
                recoveryDue: response.wallet.recoveryDue,
                recentTransactions: [
                  {
                    id: response.transaction.id,
                    type: response.transaction.type,
                    amount: response.transaction.amount,
                    reference: response.transaction.reference,
                    description: response.transaction.description,
                    createdAt: response.transaction.createdAt,
                    paymentAttemptId: null,
                    provider: null,
                    commissionAmount: 0,
                  },
                  ...wallet.recentTransactions.filter(
                    (transaction) =>
                      transaction.id !== response.transaction.id,
                  ),
                ].slice(0, 5),
              }
            : wallet,
        ),
      );
      setStatusByWalletId((current) => ({
        ...current,
        [walletId]:
          response.action === 'already_recorded'
            ? 'Recouvrement deja enregistre.'
            : 'Recouvrement enregistre.',
      }));
    } catch {
      setStatusByWalletId((current) => ({
        ...current,
        [walletId]: "Le recouvrement n'a pas pu etre enregistre.",
      }));
    } finally {
      endMutation(mutationKey);
    }
  }

  async function downloadSettlement(format: 'csv' | 'pdf') {
    const mutationKey = `export:${format}`;

    if (!beginMutation(mutationKey)) {
      return;
    }

    setExportStatus(`Export ${format.toUpperCase()}...`);

    try {
      const response = await fetch(
        `/api/admin/driver-payouts/settlement.${format}?status=PREPARED`,
        {
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mobilis-driver-payout-settlement.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setExportStatus(`Export ${format.toUpperCase()} pret.`);
    } catch {
      setExportStatus(`Export ${format.toUpperCase()} indisponible.`);
    } finally {
      endMutation(mutationKey);
    }
  }

  return (
    <section className="panel">
      <div className="roadmap-heading">
        <div>
          <p className="eyebrow">Revenus chauffeurs</p>
          <h2>Wallets et payouts</h2>
        </div>
        <p className="lede">
          Suivi ops des soldes chauffeurs, commissions Mobilis et dernieres
          ecritures ledger issues des paiements reconciles.
        </p>
        <div className="ticket-actions">
          <button
            className="ticket-button ticket-button-neutral"
            onClick={() => void downloadSettlement('csv')}
            type="button"
          >
            Export CSV
          </button>
          <button
            className="ticket-button ticket-button-neutral"
            onClick={() => void downloadSettlement('pdf')}
            type="button"
          >
            Export PDF
          </button>
          {exportStatus ? (
            <span className="queue-status">{exportStatus}</span>
          ) : null}
        </div>
      </div>

      <div className="trip-meta-grid">
        <div className="trip-meta-card">
          <span>Wallets</span>
          <strong>{summaryState.walletCount}</strong>
        </div>
        <div className="trip-meta-card">
          <span>Solde total</span>
          <strong>{formatMoney(summaryState.totalBalance)}</strong>
        </div>
        <div className="trip-meta-card">
          <span>Payouts generes</span>
          <strong>{formatMoney(summaryState.totalPayouts)}</strong>
        </div>
        <div className="trip-meta-card">
          <span>Commission Mobilis</span>
          <strong>{formatMoney(summaryState.totalCommission)}</strong>
        </div>
        <div className="trip-meta-card">
          <span>Recouvrement du</span>
          <strong>{formatMoney(summaryState.totalRecoveryDue)}</strong>
        </div>
      </div>

      <div className="roadmap-grid live-ops-grid">
        {walletState.map((wallet) => (
          <article className="phase-card live-trip-card" key={wallet.id}>
            <div className="ticket-topline">
              <span className="phase-status phase-status-completed">
                {wallet.verificationStatus ?? 'verification inconnue'}
              </span>
              <span className="live-trip-fare">
                {formatMoney(wallet.balance, wallet.currency)}
              </span>
            </div>
            {wallet.recoveryDue > 0 ? (
              <span className="phase-status phase-status-planned">
                Recouvrement du {formatMoney(wallet.recoveryDue, wallet.currency)}
              </span>
            ) : null}
            <h3>{wallet.driverName}</h3>
            <p>
              Statut chauffeur: {wallet.driverStatus ?? 'non renseigne'} -
              derniere activite{' '}
              {formatAdminDateTime(wallet.lastActivityAt)}
            </p>
            <div className="trip-meta-grid">
              <div className="trip-meta-card">
                <span>Payout net</span>
                <strong>{formatMoney(wallet.payoutTotal, wallet.currency)}</strong>
              </div>
              <div className="trip-meta-card">
                <span>Commission</span>
                <strong>
                  {formatMoney(wallet.commissionTotal, wallet.currency)}
                </strong>
              </div>
            </div>
            {wallet.recentTransactions.slice(0, 3).map((transaction) => (
              <p key={transaction.id}>
                {transaction.type} {formatMoney(transaction.amount, wallet.currency)}
                {transaction.provider ? ` - ${transaction.provider}` : ''}
                {transaction.reference ? ` - ${transaction.reference}` : ''}
              </p>
            ))}
            {!wallet.recentTransactions.length ? (
              <p>Aucune ecriture ledger recente.</p>
            ) : null}
            {wallet.preparedPayout ? (
              <p>
                Payout prepare: {formatMoney(
                  wallet.preparedPayout.amount,
                  wallet.preparedPayout.currency,
                )}{' '}
                - {wallet.preparedPayout.reference}
              </p>
            ) : null}
            <div className="ticket-actions">
              <button
                className="ticket-button ticket-button-neutral"
                disabled={
                  wallet.balance <= 0 ||
                  wallet.recoveryDue > 0 ||
                  Boolean(wallet.preparedPayout)
                }
                onClick={() => void preparePayout(wallet.id)}
                type="button"
              >
                Preparer payout
              </button>
              {wallet.preparedPayout ? (
                <button
                  className="ticket-button"
                  onClick={() =>
                    void markPayoutPaid(wallet.id, wallet.preparedPayout!.id)
                  }
                  type="button"
                >
                  Marquer paye
                </button>
              ) : null}
              {wallet.recoveryDue > 0 ? (
                <button
                  className="ticket-button ticket-button-success"
                  onClick={() => void recordRecovery(wallet.id, wallet.recoveryDue)}
                  type="button"
                >
                  Enregistrer recouvrement
                </button>
              ) : null}
              {statusByWalletId[wallet.id] ? (
                <span className="queue-status">
                  {statusByWalletId[wallet.id]}
                </span>
              ) : null}
            </div>
          </article>
        ))}
        {!wallets.wallets.length ? (
          <article className="phase-card">
            <span className="phase-status phase-status-planned">ledger</span>
            <h3>Aucun wallet chauffeur actif</h3>
            <p>
              Les payouts apparaitront apres les premiers paiements reconciles.
            </p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
