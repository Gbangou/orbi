import { HealthIncidentJournalService } from './health-incident-journal.service';

describe('HealthIncidentJournalService', () => {
  function createService(limit = 3) {
    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'operations.healthIncidentHistoryLimit' ? limit : undefined,
        ),
    };

    return {
      configService,
      service: new HealthIncidentJournalService(configService as never),
    };
  }

  it('keeps the newest incidents first and trims the journal to the configured limit', () => {
    const { service } = createService(2);

    service.record({
      tone: 'alert',
      status: 'degraded',
      title: 'Alerte systeme publiee',
      detail: 'redis unavailable',
      createdAt: '2026-04-19T03:10:00.000Z',
    });
    service.record({
      tone: 'recovered',
      status: 'ok',
      title: 'Sante systeme retablie',
      detail: 'Toutes les dependances critiques sont revenues a un etat sain.',
      createdAt: '2026-04-19T03:11:00.000Z',
    });
    service.record({
      tone: 'alert',
      status: 'degraded',
      title: 'Alerte systeme publiee',
      detail: 'database timeout',
      createdAt: '2026-04-19T03:12:00.000Z',
    });

    expect(service.list()).toEqual([
      expect.objectContaining({
        tone: 'alert',
        detail: 'database timeout',
        createdAt: '2026-04-19T03:12:00.000Z',
        acknowledgedAt: null,
        acknowledgedBy: null,
        mutedAt: null,
        mutedBy: null,
      }),
      expect.objectContaining({
        tone: 'recovered',
        detail:
          'Toutes les dependances critiques sont revenues a un etat sain.',
        createdAt: '2026-04-19T03:11:00.000Z',
        acknowledgedAt: null,
        acknowledgedBy: null,
        mutedAt: null,
        mutedBy: null,
      }),
    ]);
  });

  it('acknowledges and mutes incidents with shared actor metadata', () => {
    const { service } = createService(3);

    service.record({
      tone: 'alert',
      status: 'degraded',
      title: 'Alerte systeme publiee',
      detail: 'redis unavailable',
      createdAt: '2026-04-19T03:10:00.000Z',
    });

    const incidentId = service.list()[0]?.id ?? '';
    const acknowledged = service.acknowledge(
      incidentId,
      {
        id: 'ops-1',
        fullName: 'Ops Mobilis',
        role: 'OPS',
      },
      '2026-04-19T03:11:00.000Z',
    );
    const muted = service.mute(
      incidentId,
      {
        id: 'admin-1',
        fullName: 'Admin Mobilis',
        role: 'ADMIN',
      },
      '2026-04-19T03:12:00.000Z',
    );

    expect(acknowledged).toEqual(
      expect.objectContaining({
        acknowledgedAt: '2026-04-19T03:11:00.000Z',
        acknowledgedBy: {
          id: 'ops-1',
          fullName: 'Ops Mobilis',
          role: 'OPS',
        },
      }),
    );
    expect(muted).toEqual(
      expect.objectContaining({
        mutedAt: '2026-04-19T03:12:00.000Z',
        mutedBy: {
          id: 'admin-1',
          fullName: 'Admin Mobilis',
          role: 'ADMIN',
        },
      }),
    );
  });
});
