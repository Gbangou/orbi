import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  activeRideRequestLifecycleStatuses,
  activeTripLifecycleStatuses,
} from '@orbi/domain';

function readMigration(name: string) {
  return readFileSync(
    join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql'),
    'utf8',
  );
}

function expectSqlStatusList(sql: string, statuses: readonly string[]) {
  for (const status of statuses) {
    expect(sql).toContain(`'${status}'`);
  }
}

describe('Prisma migration invariants', () => {
  it('keeps the rider active-flow partial unique indexes in SQL migrations', () => {
    const sql = readMigration(
      '20260426123000_restore_rider_active_flow_indexes',
    );

    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ride_requests_single_active_per_rider_idx"',
    );
    expect(sql).toContain('ON "ride_requests" ("rider_id")');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "trips_single_active_per_rider_idx"',
    );
    expect(sql).toContain('ON "trips" ("rider_id")');

    expectSqlStatusList(sql, activeRideRequestLifecycleStatuses);
    expectSqlStatusList(sql, activeTripLifecycleStatuses);
  });

  it('does not drop rider active-flow partial unique indexes in later migrations', () => {
    const migrationsPath = join(process.cwd(), 'prisma', 'migrations');
    const migrations = readdirSync(migrationsPath, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name > '20260426123000_restore_rider_active_flow_indexes',
      )
      .map((entry) => entry.name)
      .sort();

    for (const migration of migrations) {
      const sql = readFileSync(
        join(migrationsPath, migration, 'migration.sql'),
        'utf8',
      );

      expect(sql).not.toContain(
        'DROP INDEX "ride_requests_single_active_per_rider_idx"',
      );
      expect(sql).not.toContain(
        'DROP INDEX "trips_single_active_per_rider_idx"',
      );
    }
  });
});
