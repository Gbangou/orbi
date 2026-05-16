import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  DriverStatus,
  ServiceTier,
  UserRole,
  VehicleType,
  VerificationStatus,
} from '@prisma/client';
import { Pool } from 'pg';
import { hashPassword } from '../src/modules/auth/auth-crypto';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/mobilis?schema=public',
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const demoPasswordHash = await hashPassword('Mobilis123!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@mobilis.app' },
    update: {
      fullName: 'Mobilis Admin',
      role: UserRole.ADMIN,
      passwordHash: demoPasswordHash,
      isActive: true,
    },
    create: {
      email: 'admin@mobilis.app',
      fullName: 'Mobilis Admin',
      role: UserRole.ADMIN,
      passwordHash: demoPasswordHash,
      wallets: {
        create: {
          currency: 'XOF',
        },
      },
    },
  });

  const riderUser = await prisma.user.upsert({
    where: { email: 'rider@mobilis.app' },
    update: {
      fullName: 'Awa Rider',
      role: UserRole.RIDER,
      passwordHash: demoPasswordHash,
      isActive: true,
    },
    create: {
      email: 'rider@mobilis.app',
      fullName: 'Awa Rider',
      role: UserRole.RIDER,
      passwordHash: demoPasswordHash,
      riderProfile: {
        create: {
          emergencyPhone: '+22670000001',
          preferredTier: ServiceTier.MOTO_STANDARD,
          savedPlaces: {
            create: {
              label: 'Home',
              address: 'Ouaga 2000, Ouagadougou',
              latitude: 12.32743,
              longitude: -1.53388,
            },
          },
        },
      },
      wallets: {
        create: {
          currency: 'XOF',
        },
      },
    },
    include: {
      riderProfile: true,
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { email: 'driver@mobilis.app' },
    update: {
      fullName: 'Issa Driver',
      role: UserRole.DRIVER,
      passwordHash: demoPasswordHash,
      isActive: true,
    },
    create: {
      email: 'driver@mobilis.app',
      fullName: 'Issa Driver',
      role: UserRole.DRIVER,
      passwordHash: demoPasswordHash,
      driverProfile: {
        create: {
          licenseNumber: 'DRV-BF-001',
          verificationStatus: VerificationStatus.APPROVED,
          status: DriverStatus.ONLINE,
          serviceRadiusKm: 8,
          vehicles: {
            create: [
              {
                plateNumber: '11 KJ 2260',
                make: 'Yamaha',
                model: 'Crypton',
                color: 'Black',
                type: VehicleType.MOTORCYCLE,
                tier: ServiceTier.MOTO_STANDARD,
              },
              {
                plateNumber: '11 JD 9021',
                make: 'Toyota',
                model: 'Corolla',
                color: 'White',
                seats: 4,
                type: VehicleType.CAR,
                tier: ServiceTier.CAR_STANDARD,
              },
            ],
          },
        },
      },
      wallets: {
        create: {
          currency: 'XOF',
        },
      },
    },
    include: {
      driverProfile: {
        include: {
          vehicles: true,
        },
      },
    },
  });

  if (driverUser.driverProfile) {
    await prisma.driverProfile.update({
      where: {
        id: driverUser.driverProfile.id,
      },
      data: {
        verificationStatus: VerificationStatus.APPROVED,
        status: DriverStatus.OFFLINE,
        serviceRadiusKm: 8,
      },
    });
  }

  const motoStandardRule = await prisma.pricingRule.findFirst({
    where: {
      vehicleType: VehicleType.MOTORCYCLE,
      serviceTier: ServiceTier.MOTO_STANDARD,
      name: 'Moto Standard',
    },
  });

  if (motoStandardRule) {
    await prisma.pricingRule.update({
      where: {
        id: motoStandardRule.id,
      },
      data: {
        baseFare: 500,
        perKmRate: 175,
        perMinuteRate: 35,
        bookingFee: 150,
        minimumFare: 1000,
        isActive: true,
      },
    });
  } else {
    await prisma.pricingRule.create({
      data: {
        name: 'Moto Standard',
        vehicleType: VehicleType.MOTORCYCLE,
        serviceTier: ServiceTier.MOTO_STANDARD,
        baseFare: 500,
        perKmRate: 175,
        perMinuteRate: 35,
        bookingFee: 150,
        minimumFare: 1000,
      },
    });
  }

  const carStandardRule = await prisma.pricingRule.findFirst({
    where: {
      vehicleType: VehicleType.CAR,
      serviceTier: ServiceTier.CAR_STANDARD,
      name: 'Car Standard',
    },
  });

  if (carStandardRule) {
    await prisma.pricingRule.update({
      where: {
        id: carStandardRule.id,
      },
      data: {
        baseFare: 900,
        perKmRate: 275,
        perMinuteRate: 55,
        bookingFee: 250,
        minimumFare: 1800,
        isActive: true,
      },
    });
  } else {
    await prisma.pricingRule.create({
      data: {
        name: 'Car Standard',
        vehicleType: VehicleType.CAR,
        serviceTier: ServiceTier.CAR_STANDARD,
        baseFare: 900,
        perKmRate: 275,
        perMinuteRate: 55,
        bookingFee: 250,
        minimumFare: 1800,
      },
    });
  }

  if (riderUser.riderProfile) {
    await prisma.rideRequest.updateMany({
      where: {
        riderId: riderUser.riderProfile.id,
        status: {
          in: ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVING'],
        },
      },
      data: {
        status: 'CANCELLED',
      },
    });
  }

  console.log(
    `Seeded Mobilis foundation data for admin ${admin.email}. Demo credentials are documented in the local runbook.`,
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
