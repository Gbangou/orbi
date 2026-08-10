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
      eyebrow: 'État de service',
      title: 'Reprise verrouillée',
      description:
        "Le compte reste visible, mais la reprise dépend d'une vérification du profil.",
      scoreLabel: '0/100',
      tone: 'rose',
      note: 'Priorité: contacter le support et garder les documents disponibles.',
      noteTone: 'rose',
      insights: [
        { label: 'Compte', value: 'Suspendu', tone: 'rose' },
        { label: 'Offres', value: 'Bloquées', tone: 'amber' },
        { label: 'Action', value: 'Support', tone: 'sky' },
      ],
    };
  }

  if (
    input.flow.availabilityStatus === 'ONLINE' &&
    !input.flow.accountCanReceiveOffers
  ) {
    return {
      eyebrow: 'État de service',
      title: 'Validation requise',
      description:
        "Les offres attendent l'approbation du profil chauffeur.",
      scoreLabel: '45/100',
      tone: 'amber',
      note: 'Priorité: faire valider le profil et le véhicule.',
      noteTone: 'amber',
      insights: [
        { label: 'Compte', value: 'En revue', tone: 'amber' },
        { label: 'Offres', value: 'Bloquées', tone: 'rose' },
        { label: 'Action', value: 'Support', tone: 'sky' },
      ],
    };
  }

  if (fatigue?.state === 'blocked') {
    return {
      eyebrow: 'État de service',
      title: 'Pause prioritaire',
      description:
        'La sécurité passe avant le volume. Les nouvelles missions doivent attendre la récupération.',
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
      eyebrow: 'État de service',
      title: 'Mission en exécution',
      description:
        'Le meilleur prochain geste est de garder la route, le passager et le support visibles.',
      scoreLabel: '88/100',
      tone: 'sky',
      note: 'Les nouvelles offres sont mises en attente pendant la course active.',
      noteTone: 'sky',
      insights: [
        { label: 'Mission', value: input.flow.primaryStatusLabel, tone: 'amber' },
        { label: 'Route', value: 'Active', tone: 'teal' },
        { label: 'Support', value: 'Prêt', tone: 'sky' },
      ],
    };
  }

  if (input.flow.availabilityStatus === 'ONLINE') {
    const score = fatigue?.state === 'warning' ? 78 : 94;

    return {
      eyebrow: 'État de service',
      title: input.flow.visibleOfferCount > 0 ? 'Prêt à choisir' : 'Prêt à recevoir',
      description:
        input.flow.visibleOfferCount > 0
          ? "Des réservations sont disponibles. Comparez gain, distance et fenêtre avant d'accepter."
          : 'Vous êtes disponible pour la prochaine demande.',
      scoreLabel: `${score}/100`,
      tone: fatigue?.state === 'warning' ? 'amber' : 'teal',
      note:
        fatigue?.state === 'warning'
          ? fatigue.reason
          : 'Position et disponibilité sont prêtes pour recevoir une mission.',
      noteTone: fatigue?.state === 'warning' ? 'amber' : 'teal',
      insights: [
        { label: 'Service', value: 'Ouvert', tone: 'teal' },
        { label: 'Offres', value: String(input.flow.visibleOfferCount), tone: 'amber' },
        { label: 'Jour', value: formatCompactXof(earningsToday), tone: 'sky' },
      ],
    };
  }

  return {
    eyebrow: 'État de service',
    title: 'Hors ligne, prêt à reprendre',
    description:
      'Passez en ligne seulement quand vous êtes vraiment disponible.',
    scoreLabel: '72/100',
    tone: 'amber',
    note: 'Le mode hors ligne évite les refus inutiles et protège votre qualité de service.',
    noteTone: 'amber',
    insights: [
      { label: 'Direct', value: 'Fermé', tone: 'amber' },
      { label: 'Session', value: 'Prête', tone: 'teal' },
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
