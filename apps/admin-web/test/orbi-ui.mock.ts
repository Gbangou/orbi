const realtimeConnectionCopy = {
  'admin-live-ops': {
    active: 'Flux live ops temps reel actif.',
    connected: 'Console live ops synchronisee en temps reel.',
    reconnecting: 'Le flux live ops se reconnecte automatiquement.',
  },
  'admin-support': {
    active: 'Flux support temps reel actif.',
    connected: 'File support synchronisee en temps reel.',
    reconnecting: 'Le flux support se reconnecte automatiquement.',
  },
  'admin-onboarding': {
    active: 'Flux onboarding temps reel actif.',
    connected: 'File onboarding synchronisee en temps reel.',
    reconnecting: 'Le flux onboarding se reconnecte automatiquement.',
  },
  'admin-feature-flags': {
    active: 'Flux feature flags temps reel actif.',
    connected: 'Feature flags synchronisees en temps reel.',
    reconnecting: 'Le flux feature flags se reconnecte automatiquement.',
  },
  'admin-health': {
    active: 'Flux health watchdog temps reel actif.',
    connected: 'Sante systeme synchronisee en temps reel.',
    reconnecting: 'Le flux health watchdog se reconnecte automatiquement.',
  },
} as const;

const frenchStatus: Record<string, string> = {
  REQUESTED: 'En attente',
  MATCHED: 'Chauffeur assigné',
  DRIVER_ARRIVING: 'Chauffeur en route',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  APPROVED: 'Approuvé',
  PENDING: 'En attente',
  REJECTED: 'Refusé',
  SUSPENDED: 'Suspendu',
  ONLINE: 'Disponible',
  OFFLINE: 'Hors ligne',
  BUSY: 'Occupé',
  MOTORCYCLE: 'Moto',
  MOTO: 'Moto',
  CAR: 'Voiture',
  MOTO_STANDARD: 'Moto',
  CLEAR: 'Normal',
  WARNING: 'Attention',
  CRITICAL: 'Critique',
  UNKNOWN: 'Inconnu',
  VERIFIED: 'Vérifié',
  UNVERIFIED: 'Non vérifié',
};

export const orbiCopy = {
  adminHeadline: 'Controlez les courses, les paiements et la confiance.',
};

export function describeRealtimeConnection(
  scope: keyof typeof realtimeConnectionCopy,
  state: keyof (typeof realtimeConnectionCopy)[keyof typeof realtimeConnectionCopy],
) {
  return realtimeConnectionCopy[scope][state];
}

export function formatOperationalStatus(status: string) {
  return (
    frenchStatus[status.toUpperCase()] ??
    status
      .toLowerCase()
      .split('_')
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ')
  );
}
