import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  DriverStatus,
  RidePaymentMethod,
  PricingCity,
  DistrictProfile,
  TripStatus,
  VehicleType,
} from '@prisma/client';
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

const PLACES = [
  { label: 'Ouaga 2000', address: 'Ouaga 2000, Ouagadougou', lat: 12.32743, lng: -1.53388 },
  { label: 'Zone du Bois', address: 'Zone du Bois, Ouagadougou', lat: 12.3651, lng: -1.5028 },
  { label: "Patte d'Oie", address: "Patte d'Oie, Ouagadougou", lat: 12.3535, lng: -1.5482 },
  { label: 'Gounghin', address: 'Gounghin, Ouagadougou', lat: 12.3684, lng: -1.5312 },
  { label: 'Aeroport International', address: 'Aeroport International de Ouagadougou', lat: 12.3532, lng: -1.5124 },
  { label: 'Centre-ville', address: 'Marche Rood Woko, Ouagadougou', lat: 12.3703, lng: -1.5247 },
  { label: 'Ouaga 2000 phase 2', address: 'Ouaga 2000 Phase 2, Ouagadougou', lat: 12.3195, lng: -1.5389 },
];

type TripPlan = {
  daysAgo: number;
  vehicleType: 'MOTORCYCLE' | 'CAR';
  pickup: (typeof PLACES)[number];
  destination: (typeof PLACES)[number];
  distanceKm: number;
  durationMinutes: number;
  fare: number;
  score: number;
  comment: string | null;
};

const TRIP_PLANS: TripPlan[] = [
  { daysAgo: 13, vehicleType: 'MOTORCYCLE', pickup: PLACES[0], destination: PLACES[3], distanceKm: 4.2, durationMinutes: 12, fare: 1805, score: 5, comment: 'Chauffeur ponctuel, trajet fluide.' },
  { daysAgo: 10, vehicleType: 'CAR', pickup: PLACES[5], destination: PLACES[4], distanceKm: 6.8, durationMinutes: 18, fare: 4010, score: 4, comment: 'Bon trajet, voiture propre.' },
  { daysAgo: 8, vehicleType: 'MOTORCYCLE', pickup: PLACES[3], destination: PLACES[1], distanceKm: 3.1, durationMinutes: 9, fare: 1508, score: 5, comment: null },
  { daysAgo: 5, vehicleType: 'CAR', pickup: PLACES[0], destination: PLACES[5], distanceKm: 9.5, durationMinutes: 22, fare: 4973, score: 3, comment: 'Trajet correct mais un peu de retard.' },
  { daysAgo: 3, vehicleType: 'MOTORCYCLE', pickup: PLACES[1], destination: PLACES[3], distanceKm: 2.4, durationMinutes: 7, fare: 1315, score: 5, comment: 'Excellent service, rapide.' },
  { daysAgo: 1, vehicleType: 'CAR', pickup: PLACES[2], destination: PLACES[0], distanceKm: 5.0, durationMinutes: 15, fare: 3350, score: 4, comment: null },
];

const DRIVER_EMAIL = process.env.EXPO_PUBLIC_ORBI_DEMO_DRIVER_EMAIL ?? 'driver@orbi.app';
const RIDER_EMAIL = process.env.EXPO_PUBLIC_ORBI_DEMO_RIDER_EMAIL ?? 'rider@orbi.app';
const DEMO_MOTO_PLATE = '11 DEMO 01';
const DEMO_CAR_PLATE = '11 DEMO 02';

async function main() {
  const driverUser = await prisma.user.findUniqueOrThrow({
    where: { email: DRIVER_EMAIL },
    include: { driverProfile: { include: { vehicles: true } } },
  });
  const riderUser = await prisma.user.findUniqueOrThrow({
    where: { email: RIDER_EMAIL },
    include: { riderProfile: true },
  });

  if (!driverUser.driverProfile || !riderUser.riderProfile) {
    throw new Error(
      `Driver/rider profile missing for ${DRIVER_EMAIL} / ${RIDER_EMAIL} — sign up or run the base seed first.`,
    );
  }

  const driverProfileId = driverUser.driverProfile.id;
  const riderProfileId = riderUser.riderProfile.id;

  const driverOriginalState = {
    verificationStatus: driverUser.driverProfile.verificationStatus,
    licenseNumber: driverUser.driverProfile.licenseNumber,
    serviceRadiusKm: driverUser.driverProfile.serviceRadiusKm
      ? Number(driverUser.driverProfile.serviceRadiusKm)
      : null,
    status: driverUser.driverProfile.status,
    currentLatitude: driverUser.driverProfile.currentLatitude
      ? Number(driverUser.driverProfile.currentLatitude)
      : null,
    currentLongitude: driverUser.driverProfile.currentLongitude
      ? Number(driverUser.driverProfile.currentLongitude)
      : null,
  };

  let motoVehicle = driverUser.driverProfile.vehicles.find((v) => v.type === 'MOTORCYCLE');
  let carVehicle = driverUser.driverProfile.vehicles.find((v) => v.type === 'CAR');
  const createdVehicleIds: string[] = [];

  if (!motoVehicle) {
    motoVehicle = await prisma.vehicle.create({
      data: {
        driverId: driverProfileId,
        plateNumber: DEMO_MOTO_PLATE,
        make: 'Yamaha',
        model: 'Crypton',
        color: 'Black',
        type: VehicleType.MOTORCYCLE,
        tier: 'MOTO_STANDARD',
      },
    });
    createdVehicleIds.push(motoVehicle.id);
  }
  if (!carVehicle) {
    carVehicle = await prisma.vehicle.create({
      data: {
        driverId: driverProfileId,
        plateNumber: DEMO_CAR_PLATE,
        make: 'Toyota',
        model: 'Corolla',
        color: 'White',
        seats: 4,
        type: VehicleType.CAR,
        tier: 'CAR_STANDARD',
      },
    });
    createdVehicleIds.push(carVehicle.id);
  }

  await prisma.driverProfile.update({
    where: { id: driverProfileId },
    data: {
      verificationStatus: 'APPROVED',
      licenseNumber: driverUser.driverProfile.licenseNumber ?? `DRV-DEMO-${driverProfileId.slice(-6).toUpperCase()}`,
      serviceRadiusKm: driverUser.driverProfile.serviceRadiusKm ?? 8,
    },
  });

  const driverWallet = await prisma.wallet.upsert({
    where: { userId_currency: { userId: driverUser.id, currency: 'XOF' } },
    update: {},
    create: { userId: driverUser.id, currency: 'XOF' },
  });

  const createdRideRequestIds: string[] = [];
  const createdTripIds: string[] = [];
  const createdRatingIds: string[] = [];
  const createdWalletTransactionIds: string[] = [];
  let walletCredit = 0;

  for (const plan of TRIP_PLANS) {
    const completedAt = new Date();
    completedAt.setDate(completedAt.getDate() - plan.daysAgo);
    completedAt.setHours(11 + (plan.daysAgo % 6), 15, 0, 0);
    const startedAt = new Date(completedAt.getTime() - plan.durationMinutes * 60_000);
    const createdAt = new Date(startedAt.getTime() - 4 * 60_000);
    const acceptedAt = new Date(createdAt.getTime() + 45_000);
    const arrivingAt = new Date(acceptedAt.getTime() + 90_000);

    const rideRequest = await prisma.rideRequest.create({
      data: {
        riderId: riderProfileId,
        status: 'EXPIRED',
        assignedDriverId: driverProfileId,
        requestedVehicleType: plan.vehicleType as VehicleType,
        paymentMethod: RidePaymentMethod.MOBILE_MONEY,
        pricingCity: PricingCity.OUAGADOUGOU,
        districtProfile: DistrictProfile.RESIDENTIAL_STANDARD,
        pickupAddress: plan.pickup.address,
        pickupLatitude: plan.pickup.lat,
        pickupLongitude: plan.pickup.lng,
        destinationAddress: plan.destination.address,
        destinationLatitude: plan.destination.lat,
        destinationLongitude: plan.destination.lng,
        estimatedFare: plan.fare,
        estimatedDistanceKm: plan.distanceKm,
        estimatedDurationMinutes: plan.durationMinutes,
        createdAt,
      },
    });
    createdRideRequestIds.push(rideRequest.id);

    const trip = await prisma.trip.create({
      data: {
        rideRequestId: rideRequest.id,
        riderId: riderProfileId,
        driverId: driverProfileId,
        vehicleId: plan.vehicleType === 'MOTORCYCLE' ? motoVehicle.id : carVehicle.id,
        status: TripStatus.COMPLETED,
        startedAt,
        completedAt,
        pickupAddress: plan.pickup.address,
        destinationAddress: plan.destination.address,
        actualFare: plan.fare,
        distanceKm: plan.distanceKm,
        durationMinutes: plan.durationMinutes,
        createdAt,
      },
    });
    createdTripIds.push(trip.id);

    await prisma.tripEvent.createMany({
      data: [
        { tripId: trip.id, eventType: 'TRIP_ACCEPTED', createdAt: acceptedAt },
        { tripId: trip.id, eventType: 'DRIVER_ARRIVING', createdAt: arrivingAt },
        { tripId: trip.id, eventType: 'TRIP_STARTED', createdAt: startedAt },
        { tripId: trip.id, eventType: 'TRIP_COMPLETED', createdAt: completedAt },
      ],
    });

    const rating = await prisma.rating.create({
      data: {
        tripId: trip.id,
        riderId: riderProfileId,
        driverId: driverProfileId,
        score: plan.score,
        comment: plan.comment,
        createdAt: completedAt,
      },
    });
    createdRatingIds.push(rating.id);

    const payout = Math.round(plan.fare * 0.82);
    walletCredit += payout;
    const walletTx = await prisma.walletTransaction.create({
      data: {
        walletId: driverWallet.id,
        type: 'CREDIT',
        amount: payout,
        reference: `demo-trip-${trip.id}`,
        description: `Course terminee: ${plan.pickup.label} -> ${plan.destination.label}`,
        createdAt: completedAt,
      },
    });
    createdWalletTransactionIds.push(walletTx.id);
  }

  await prisma.wallet.update({
    where: { id: driverWallet.id },
    data: { balance: { increment: walletCredit } },
  });

  const scores = TRIP_PLANS.map((p) => p.score);
  const avgRating = scores.reduce((a, b) => a + b, 0) / scores.length;

  await prisma.driverProfile.update({
    where: { id: driverProfileId },
    data: {
      completedTripsCount: { increment: TRIP_PLANS.length },
      averageRating: Math.round(avgRating * 100) / 100,
      status: DriverStatus.ONLINE,
      currentLatitude: PLACES[0].lat,
      currentLongitude: PLACES[0].lng,
    },
  });

  const pendingPickup = PLACES[5];
  const pendingDestination = PLACES[0];
  const pendingRequest = await prisma.rideRequest.create({
    data: {
      riderId: riderProfileId,
      status: 'REQUESTED',
      requestedVehicleType: VehicleType.MOTORCYCLE,
      paymentMethod: RidePaymentMethod.MOBILE_MONEY,
      pricingCity: PricingCity.OUAGADOUGOU,
      districtProfile: DistrictProfile.RESIDENTIAL_STANDARD,
      pickupAddress: pendingPickup.address,
      pickupLatitude: pendingPickup.lat,
      pickupLongitude: pendingPickup.lng,
      destinationAddress: pendingDestination.address,
      destinationLatitude: pendingDestination.lat,
      destinationLongitude: pendingDestination.lng,
      estimatedFare: 1650,
      estimatedDistanceKm: 3.6,
      estimatedDurationMinutes: 11,
    },
  });
  createdRideRequestIds.push(pendingRequest.id);

  const manifest = {
    createdAt: new Date().toISOString(),
    driverProfileId,
    riderProfileId,
    driverOriginalState,
    createdVehicleIds,
    rideRequestIds: createdRideRequestIds,
    tripIds: createdTripIds,
    ratingIds: createdRatingIds,
    walletTransactionIds: createdWalletTransactionIds,
    walletId: driverWallet.id,
    walletCreditTotal: walletCredit,
    driverProfileCompletedTripsIncrement: TRIP_PLANS.length,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(
    `Seeded ${TRIP_PLANS.length} completed trips + 1 pending request for demo driver/rider. Manifest: ${MANIFEST_PATH}`,
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
