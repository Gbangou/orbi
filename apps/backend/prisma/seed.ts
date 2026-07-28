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
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5433/orbi?schema=public',
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const demoPasswordHash = await hashPassword('Orbi123!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@orbi.app' },
    update: {
      fullName: 'Orbi Admin',
      role: UserRole.ADMIN,
      passwordHash: demoPasswordHash,
      isActive: true,
    },
    create: {
      email: 'admin@orbi.app',
      fullName: 'Orbi Admin',
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
    where: { email: 'rider@orbi.app' },
    update: {
      fullName: 'Awa Rider',
      role: UserRole.RIDER,
      passwordHash: demoPasswordHash,
      isActive: true,
    },
    create: {
      email: 'rider@orbi.app',
      fullName: 'Awa Rider',
      role: UserRole.RIDER,
      passwordHash: demoPasswordHash,
      riderProfile: {
        create: {
          emergencyPhone: '+22670000001',
          preferredTier: ServiceTier.MOTO_STANDARD,
          trustedContacts: {
            create: {
              label: 'Contact principal',
              phoneNumber: '+22670000001',
              priority: 1,
              isActive: true,
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

  const existingDemoDriverProfile = await prisma.driverProfile.findUnique({
    where: {
      licenseNumber: 'DRV-BF-001',
    },
  });

  const driverUser = await prisma.user.upsert({
    where: { email: 'driver@orbi.app' },
    update: {
      fullName: 'Issa Driver',
      role: UserRole.DRIVER,
      passwordHash: demoPasswordHash,
      isActive: true,
    },
    create: {
      email: 'driver@orbi.app',
      fullName: 'Issa Driver',
      role: UserRole.DRIVER,
      passwordHash: demoPasswordHash,
      wallets: {
        create: {
          currency: 'XOF',
        },
      },
    },
  });

  const driverProfile =
    existingDemoDriverProfile?.userId === driverUser.id
      ? await prisma.driverProfile.update({
          where: {
            id: existingDemoDriverProfile.id,
          },
          data: {
            verificationStatus: VerificationStatus.APPROVED,
            status: DriverStatus.OFFLINE,
            serviceRadiusKm: 8,
          },
        })
      : await prisma.driverProfile.upsert({
          where: {
            userId: driverUser.id,
          },
          update: {
            verificationStatus: VerificationStatus.APPROVED,
            status: DriverStatus.OFFLINE,
            serviceRadiusKm: 8,
          },
          create: {
            userId: driverUser.id,
            licenseNumber: existingDemoDriverProfile
              ? `DRV-BF-001-${driverUser.id.slice(-6).toUpperCase()}`
              : 'DRV-BF-001',
            verificationStatus: VerificationStatus.APPROVED,
            status: DriverStatus.OFFLINE,
            serviceRadiusKm: 8,
          },
        });

  await prisma.vehicle.upsert({
    where: {
      plateNumber: '11 KJ 2260',
    },
    update: {
      driverId: driverProfile.id,
      make: 'Yamaha',
      model: 'Crypton',
      color: 'Black',
      type: VehicleType.MOTORCYCLE,
      tier: ServiceTier.MOTO_STANDARD,
      isActive: true,
    },
    create: {
      driverId: driverProfile.id,
      plateNumber: '11 KJ 2260',
      make: 'Yamaha',
      model: 'Crypton',
      color: 'Black',
      type: VehicleType.MOTORCYCLE,
      tier: ServiceTier.MOTO_STANDARD,
    },
  });

  await prisma.vehicle.upsert({
    where: {
      plateNumber: '11 JD 9021',
    },
    update: {
      driverId: driverProfile.id,
      make: 'Toyota',
      model: 'Corolla',
      color: 'White',
      seats: 4,
      type: VehicleType.CAR,
      tier: ServiceTier.CAR_STANDARD,
      isActive: true,
    },
    create: {
      driverId: driverProfile.id,
      plateNumber: '11 JD 9021',
      make: 'Toyota',
      model: 'Corolla',
      color: 'White',
      seats: 4,
      type: VehicleType.CAR,
      tier: ServiceTier.CAR_STANDARD,
    },
  });

  if (driverProfile) {
    await prisma.driverProfile.update({
      where: {
        id: driverProfile.id,
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
      name: 'Moto',
    },
  });

  if (motoStandardRule) {
    await prisma.pricingRule.update({
      where: {
        id: motoStandardRule.id,
      },
      data: {
        baseFare: 200,
        perKmRate: 110,
        perMinuteRate: 20,
        bookingFee: 50,
        minimumFare: 650,
        isActive: true,
      },
    });
  } else {
    await prisma.pricingRule.create({
      data: {
        name: 'Moto',
        vehicleType: VehicleType.MOTORCYCLE,
        serviceTier: ServiceTier.MOTO_STANDARD,
        baseFare: 200,
        perKmRate: 110,
        perMinuteRate: 20,
        bookingFee: 50,
        minimumFare: 650,
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
        baseFare: 500,
        perKmRate: 240,
        perMinuteRate: 45,
        bookingFee: 100,
        minimumFare: 1500,
        isActive: true,
      },
    });
  } else {
    await prisma.pricingRule.create({
      data: {
        name: 'Car Standard',
        vehicleType: VehicleType.CAR,
        serviceTier: ServiceTier.CAR_STANDARD,
        baseFare: 500,
        perKmRate: 240,
        perMinuteRate: 45,
        bookingFee: 100,
        minimumFare: 1500,
      },
    });
  }

  if (riderUser.riderProfile) {
    await prisma.savedPlace.deleteMany({
      where: {
        riderId: riderUser.riderProfile.id,
        label: {
          in: ['Home', 'Maison', 'Bureau'],
        },
      },
    });

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
    `Seeded Orbi foundation data for admin ${admin.email}. Field accounts are offline by default and contain no quick-destination prototype shortcuts.`,
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
