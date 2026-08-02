import type { DriverFatigueStatus } from '@orbi/api';
import type { DriverActiveFlowSummary } from './driver-active-flow';
import { toFiniteEarningsNumber } from './driver-earnings-signal';

type ReadinessTone = 'teal' | 'amber' | 'sky' | 'rose';

export type DriverShiftReadiness = {
  eyebrow: string;
  title: string;
  description: string;
  scoreLabel: string;
  tone: ReadinessTone;
  note: string;
  noteTone: ReadinessTone;
  insights: Array<{
    label: string;
    value: string;
    tone: ReadinessTone;
  }>;
};

export function buildDriverShiftReadiness(input: {
  flow: DriverActiveFlowSummary;
  fatigue: DriverFatigueStatus | null | undefined;
  earningsToday?: unknown;
}): DriverShiftReadiness {
  const fatigue = input.fatigue;
  const earningsToday = toFiniteEarningsNumber(input.earningsToday) ?? 0;

  if (input.flow.operationalStatus === 'SUSPENDED') {
    return {
      eyebrow: 'Etat de service',
      title: 'Reprise verrouillee',
      description:
        'Le compte reste visible, mais la reprise depend d une verification du profil.',
      scoreLabel: '0/100',
      tone: 'rose',
      note: 'Priorite: contacter le support et garder les documents disponibles.',
      noteTone: 'rose',
      insights: [
        { label: 'Compte', value: 'Suspendu', tone: 'rose' },
        { label: 'Offres', value: 'Bloquees', tone: 'amber' },
        { label: 'Action', value: 'Support', tone: 'sky' },
      ],
    };
  }

  if (
    input.flow.availabilityStatus === 'ONLINE' &&
    !input.flow.accountCanReceiveOffers
  ) {
    return {
      eyebrow: 'Etat de service',
      title: 'Validation requise',
      description:
        'Le direct peut rester visible, mais les offres attendent l approbation du profil chauffeur.',
      scoreLabel: '45/100',
      tone: 'amber',
      note: 'Priorite: faire valider le profil et le vehicule.',
      noteTone: 'amber',
      insights: [
        { label: 'Compte', value: 'En revue', tone: 'amber' },
        { label: 'Offres', value: 'Bloquees', tone: 'rose' },
        { label: 'Action', value: 'Support', tone: 'sky' },
      ],
    };
  }

  if (fatigue?.state === 'blocked') {
    return {
      eyebrow: 'Etat de service',
      title: 'Pause prioritaire',
      description:
        'La securite passe avant le volume. Les nouvelles missions doivent attendre la recuperation.',
      scoreLabel: '35/100',
      tone: 'rose',
      note: fatigue.reason,
      noteTone: 'rose',
      insights: [
        { label: 'Fatigue', value: 'Pause', tone: 'rose' },
        { label: 'Repos', value: `${fatigue.restMinutes} min`, tone: 'amber' },
        { label: 'Courses', value: String(fatigue.completedTrips), tone: 'sky' },
      ],
    };
  }

  if (input.flow.activeTrip) {
    return {
      eyebrow: 'Etat de service',
      title: 'Mission en execution',
      description:
        'Le meilleur prochain geste est de garder la route, le code passager et le support visibles.',
      scoreLabel: '88/100',
      tone: 'sky',
      note: 'Les nouvelles offres sont mises en attente pendant la course active.',
      noteTone: 'sky',
      insights: [
        { label: 'Mission', value: input.flow.primaryStatusLabel, tone: 'amber' },
        { label: 'Route', value: 'Active', tone: 'teal' },
        { label: 'Support', value: 'Pret', tone: 'sky' },
      ],
    };
  }

  if (input.flow.availabilityStatus === 'ONLINE') {
    const score = fatigue?.state === 'warning' ? 78 : 94;

    return {
      eyebrow: 'Etat de service',
      title: input.flow.visibleOfferCount > 0 ? 'Pret a choisir' : 'Pret a recevoir',
      description:
        input.flow.visibleOfferCount > 0
          ? 'Des reservations sont disponibles. Comparez gain, distance et fenetre avant d accepter.'
          : 'Le direct est ouvert. Vous etes disponible pour la prochaine demande.',
      scoreLabel: `${score}/100`,
      tone: fatigue?.state === 'warning' ? 'amber' : 'teal',
      note:
        fatigue?.state === 'warning'
          ? fatigue.reason
          : 'Position et disponibilite sont pretes pour recevoir une mission.',
      noteTone: fatigue?.state === 'warning' ? 'amber' : 'teal',
      insights: [
        { label: 'Direct', value: 'Ouvert', tone: 'teal' },
        { label: 'Offres', value: String(input.flow.visibleOfferCount), tone: 'amber' },
        { label: 'Jour', value: formatCompactXof(earningsToday), tone: 'sky' },
      ],
    };
  }

  return {
    eyebrow: 'Etat de service',
    title: 'Hors ligne, pret a reprendre',
    description:
      'Le compte reste synchronise. Passez en ligne seulement quand vous etes vraiment disponible.',
    scoreLabel: '72/100',
    tone: 'amber',
    note: 'Le mode hors ligne evite les refus inutiles et protege votre qualite de service.',
    noteTone: 'amber',
    insights: [
      { label: 'Direct', value: 'Ferme', tone: 'amber' },
      { label: 'Session', value: 'Prete', tone: 'teal' },
      { label: 'Jour', value: formatCompactXof(earningsToday), tone: 'sky' },
    ],
  };
}

function formatCompactXof(value: unknown) {
  const amount = toFiniteEarningsNumber(value) ?? 0;

  if (amount <= 0) {
    return '0 XOF';
  }

  if (amount >= 1000) {
    return `${Math.round(amount / 100) / 10}k XOF`;
  }

  return `${amount} XOF`;
}
