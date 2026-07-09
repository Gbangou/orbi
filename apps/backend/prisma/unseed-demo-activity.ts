import 'dotenv/config';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, DriverStatus } from '@prisma/client';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5433/orbi?schema=public',
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const MANIFEST_PATH = join(__dirname, 'demo-activity-manifest.json');

type Manifest = {
  driverProfileId: string;
  riderProfileId: string;
  driverOriginalState: {
    verificationStatus: string;
    licenseNumber: string | null;
    serviceRadiusKm: number | null;
    status: string;
    currentLatitude: number | null;
    currentLongitude: number | null;
  };
  createdVehicleIds: string[];
  rideRequestIds: string[];
  tripIds: string[];
  ratingIds: string[];
  walletTransactionIds: string[];
  walletId: string;
  walletCreditTotal: number;
  driverProfileCompletedTripsIncrement: number;
};

async function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.log('No demo-activity-manifest.json found — nothing to clean up.');
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;

  await prisma.rating.deleteMany({ where: { id: { in: manifest.ratingIds } } });
  await prisma.walletTransaction.deleteMany({
    where: { id: { in: manifest.walletTransactionIds } },
  });
  await prisma.tripEvent.deleteMany({ where: { tripId: { in: manifest.tripIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: manifest.tripIds } } });
  await prisma.rideRequest.deleteMany({ where: { id: { in: manifest.rideRequestIds } } });

  await prisma.wallet.update({
    where: { id: manifest.walletId },
    data: { balance: { decrement: manifest.walletCreditTotal } },
  });

  if (manifest.createdVehicleIds.length > 0) {
    await prisma.vehicle.deleteMany({ where: { id: { in: manifest.createdVehicleIds } } });
  }

  await prisma.driverProfile.update({
    where: { id: manifest.driverProfileId },
    data: {
      completedTripsCount: { decrement: manifest.driverProfileCompletedTripsIncrement },
      averageRating: null,
      status: manifest.driverOriginalState.status as DriverStatus,
      verificationStatus: manifest.driverOriginalState.verificationStatus as never,
      licenseNumber: manifest.driverOriginalState.licenseNumber,
      serviceRadiusKm: manifest.driverOriginalState.serviceRadiusKm,
      currentLatitude: manifest.driverOriginalState.currentLatitude,
      currentLongitude: manifest.driverOriginalState.currentLongitude,
    },
  });

  unlinkSync(MANIFEST_PATH);

  console.log(
    `Removed ${manifest.tripIds.length} demo trips, ${manifest.rideRequestIds.length} ride requests, ${manifest.ratingIds.length} ratings, ${manifest.walletTransactionIds.length} wallet transactions, ${manifest.createdVehicleIds.length} demo vehicles. Driver profile restored to original state.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
