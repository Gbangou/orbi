import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserRole } from '@prisma/client';

export type HealthIncidentActor = {
  id: string;
  fullName: string;
  role: UserRole;
};

export type HealthIncidentHistoryEntry = {
  id: string;
  tone: 'alert' | 'recovered';
  status: 'ok' | 'degraded';
  createdAt: string;
  title: string;
  detail: string;
  acknowledgedAt: string | null;
  acknowledgedBy: HealthIncidentActor | null;
  mutedAt: string | null;
  mutedBy: HealthIncidentActor | null;
};

@Injectable()
export class HealthIncidentJournalService {
  private entries: HealthIncidentHistoryEntry[] = [];
  private sequence = 0;

  constructor(private readonly configService: ConfigService) {}

  record(
    entry: Omit<
      HealthIncidentHistoryEntry,
      | 'id'
      | 'createdAt'
      | 'acknowledgedAt'
      | 'acknowledgedBy'
      | 'mutedAt'
      | 'mutedBy'
    > & {
      createdAt?: string;
    },
  ) {
    const createdAt = entry.createdAt ?? new Date().toISOString();
    const id = `health:${entry.tone}:${entry.status}:${createdAt}:${this.sequence++}`;

    this.entries = [
      {
        ...entry,
        id,
        createdAt,
        acknowledgedAt: null,
        acknowledgedBy: null,
        mutedAt: null,
        mutedBy: null,
      },
      ...this.entries,
    ].slice(0, this.getLimit());
  }

  list() {
    return [...this.entries];
  }

  acknowledge(
    incidentId: string,
    actor: HealthIncidentActor,
    acknowledgedAt = new Date().toISOString(),
  ): HealthIncidentHistoryEntry | null {
    return this.updateEntry(incidentId, (entry) => ({
      ...entry,
      acknowledgedAt,
      acknowledgedBy: actor,
    }));
  }

  mute(
    incidentId: string,
    actor: HealthIncidentActor,
    mutedAt = new Date().toISOString(),
  ): HealthIncidentHistoryEntry | null {
    return this.updateEntry(incidentId, (entry) => ({
      ...entry,
      mutedAt,
      mutedBy: actor,
    }));
  }

  private getLimit() {
    return (
      this.configService.get<number>('operations.healthIncidentHistoryLimit') ??
      12
    );
  }

  private updateEntry(
    incidentId: string,
    updater: (entry: HealthIncidentHistoryEntry) => HealthIncidentHistoryEntry,
  ): HealthIncidentHistoryEntry | null {
    let updatedEntry: HealthIncidentHistoryEntry | null = null;

    this.entries = this.entries.map((entry) => {
      if (entry.id !== incidentId) {
        return entry;
      }

      updatedEntry = updater(entry);
      return updatedEntry;
    });

    return updatedEntry;
  }
}
