import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { CreateSavedPlaceDto } from './dto/create-saved-place.dto';
import { UpdateSavedPlaceDto } from './dto/update-saved-place.dto';

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

@Injectable()
export class RidersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(auth: RequestAuthContext) {
    const riderProfileId = auth.user.riderProfile?.id;

    if (!riderProfileId) {
      throw new NotFoundException(
        'No rider profile found for the authenticated user.',
      );
    }

    const [profile, totalRideRequests, totalTrips, completedTrips] =
      await Promise.all([
        this.prisma.riderProfile.findUnique({
          where: {
            id: riderProfileId,
          },
          include: {
            user: true,
            savedPlaces: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        }),
        this.prisma.rideRequest.count({
          where: {
            riderId: riderProfileId,
          },
        }),
        this.prisma.trip.count({
          where: {
            riderId: riderProfileId,
          },
        }),
        this.prisma.trip.count({
          where: {
            riderId: riderProfileId,
            status: 'COMPLETED',
          },
        }),
      ]);

    if (!profile) {
      throw new NotFoundException('Rider profile could not be loaded.');
    }

    return {
      profile: {
        id: profile.id,
        fullName: profile.user.fullName,
        email: profile.user.email,
        phoneNumber: profile.user.phoneNumber,
        preferredTier: profile.preferredTier,
        emergencyPhone: profile.emergencyPhone,
        savedPlaces: profile.savedPlaces.map((place) => ({
          id: place.id,
          label: place.label,
          address: place.address,
          latitude: toNumber(place.latitude),
          longitude: toNumber(place.longitude),
        })),
        stats: {
          totalRideRequests,
          totalTrips,
          completedTrips,
          savedPlaces: profile.savedPlaces.length,
        },
      },
    };
  }

  async overview() {
    const riders = await this.prisma.riderProfile.findMany({
      include: {
        user: true,
        savedPlaces: true,
      },
      take: 25,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      total: riders.length,
      riders,
    };
  }

  async createSavedPlace(
    auth: RequestAuthContext,
    payload: CreateSavedPlaceDto,
  ) {
    const riderProfileId = this.getRiderProfileId(auth);

    const createdPlace = await this.prisma.savedPlace.create({
      data: {
        riderId: riderProfileId,
        label: payload.label.trim(),
        address: payload.address.trim(),
        latitude: payload.latitude,
        longitude: payload.longitude,
      },
    });

    return {
      savedPlace: this.serializeSavedPlace(createdPlace),
    };
  }

  async updateSavedPlace(
    auth: RequestAuthContext,
    savedPlaceId: string,
    payload: UpdateSavedPlaceDto,
  ) {
    const riderProfileId = this.getRiderProfileId(auth);
    const existingPlace = await this.prisma.savedPlace.findUnique({
      where: {
        id: savedPlaceId,
      },
    });

    if (!existingPlace || existingPlace.riderId !== riderProfileId) {
      throw new NotFoundException('Saved place not found for this rider.');
    }

    if (
      (payload.latitude === undefined) !==
      (payload.longitude === undefined)
    ) {
      throw new BadRequestException(
        'Latitude and longitude must be provided together.',
      );
    }

    const updatedPlace = await this.prisma.savedPlace.update({
      where: {
        id: savedPlaceId,
      },
      data: {
        label: payload.label?.trim(),
        address: payload.address?.trim(),
        ...(payload.latitude !== undefined
          ? {
              latitude: payload.latitude,
              longitude: payload.longitude,
            }
          : {}),
      },
    });

    return {
      savedPlace: this.serializeSavedPlace(updatedPlace),
    };
  }

  async deleteSavedPlace(auth: RequestAuthContext, savedPlaceId: string) {
    const riderProfileId = this.getRiderProfileId(auth);
    const existingPlace = await this.prisma.savedPlace.findUnique({
      where: {
        id: savedPlaceId,
      },
    });

    if (!existingPlace || existingPlace.riderId !== riderProfileId) {
      throw new NotFoundException('Saved place not found for this rider.');
    }

    await this.prisma.savedPlace.delete({
      where: {
        id: savedPlaceId,
      },
    });

    return {
      deleted: true,
      savedPlaceId,
    };
  }

  private getRiderProfileId(auth: RequestAuthContext) {
    const riderProfileId = auth.user.riderProfile?.id;

    if (!riderProfileId) {
      throw new NotFoundException(
        'No rider profile found for the authenticated user.',
      );
    }

    return riderProfileId;
  }

  private serializeSavedPlace(place: {
    id: string;
    label: string;
    address: string;
    latitude: unknown;
    longitude: unknown;
  }) {
    return {
      id: place.id,
      label: place.label,
      address: place.address,
      latitude: toNumber(place.latitude),
      longitude: toNumber(place.longitude),
    };
  }
}
