import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RequestAuthContext } from '../auth/auth.types';
import { CreateSavedPlaceDto } from './dto/create-saved-place.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';
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
            trustedContacts: {
              orderBy: [{ isActive: 'desc' }, { priority: 'asc' }],
            },
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

    const trustedContacts = this.serializeTrustedContacts(
      profile.trustedContacts,
      profile.emergencyPhone,
    );
    const primaryTrustedContact = trustedContacts[0] ?? null;

    return {
      profile: {
        id: profile.id,
        fullName: profile.user.fullName,
        email: profile.user.email,
        phoneNumber: profile.user.phoneNumber,
        preferredTier: profile.preferredTier,
        emergencyPhone: profile.emergencyPhone,
        trustedContact: {
          phoneNumber: primaryTrustedContact?.phoneNumber ?? null,
          shareMode: primaryTrustedContact
            ? profile.trustedContactShareMode
            : 'DISABLED',
          status: primaryTrustedContact ? 'READY' : 'MISSING',
          safetyNote: primaryTrustedContact
            ? profile.trustedContactShareMode === 'MANUAL'
              ? 'Contact de confiance pret pour recevoir un lien trajet manuel.'
              : 'Contact de confiance pret pour le partage trajet automatique selon vos regles.'
            : 'Ajoutez un numero Burkina pour accelerer le partage en cas de trajet sensible.',
        },
        trustedContacts,
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
        user: {
          select: {
            fullName: true,
            email: true,
            phoneNumber: true,
            isActive: true,
            isPhoneVerified: true,
            createdAt: true,
          },
        },
        savedPlaces: { select: { id: true } },
      },
      take: 25,
      orderBy: { createdAt: 'desc' },
    });

    return {
      total: riders.length,
      riders: riders.map((r) => ({
        id: r.id,
        userId: r.userId,
        fullName: r.user.fullName,
        email: r.user.email,
        phoneNumber: r.user.phoneNumber,
        isActive: r.user.isActive,
        isPhoneVerified: r.user.isPhoneVerified,
        savedPlacesCount: r.savedPlaces.length,
        createdAt: r.user.createdAt.toISOString(),
      })),
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

  async updateTrustedContact(
    auth: RequestAuthContext,
    payload: UpdateTrustedContactDto,
  ) {
    const riderProfileId = this.getRiderProfileId(auth);
    const normalizedPhone = payload.phoneNumber?.trim() || null;
    const shareMode = normalizedPhone
      ? (payload.shareMode ?? 'MANUAL')
      : 'MANUAL';
    const notes = payload.notes?.trim() || null;

    if (
      !normalizedPhone &&
      payload.shareMode &&
      payload.shareMode !== 'MANUAL'
    ) {
      throw new BadRequestException(
        'A trusted contact phone number is required for automatic share modes.',
      );
    }

    const updatedProfile = await this.prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.riderProfile.update({
        where: {
          id: riderProfileId,
        },
        data: {
          emergencyPhone: normalizedPhone,
          trustedContactShareMode: shareMode,
        },
      });

      if (normalizedPhone) {
        await tx.riderTrustedContact.updateMany({
          where: {
            riderId: riderProfileId,
            phoneNumber: {
              not: normalizedPhone,
            },
          },
          data: {
            isActive: false,
          },
        });

        await tx.riderTrustedContact.upsert({
          where: {
            riderId_phoneNumber: {
              riderId: riderProfileId,
              phoneNumber: normalizedPhone,
            },
          },
          update: {
            label: 'Contact principal',
            priority: 1,
            isActive: true,
          },
          create: {
            riderId: riderProfileId,
            label: 'Contact principal',
            phoneNumber: normalizedPhone,
            priority: 1,
            isActive: true,
          },
        });
      } else {
        await tx.riderTrustedContact.updateMany({
          where: {
            riderId: riderProfileId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: 'RIDER_TRUSTED_CONTACT_UPDATED',
          entityType: 'RIDER_PROFILE',
          entityId: riderProfileId,
          metadata: {
            hasTrustedContact: Boolean(normalizedPhone),
            shareMode,
            notes,
            activeTrustedContacts: normalizedPhone ? 1 : 0,
          },
        },
      });

      return updatedProfile;
    });

    return {
      trustedContact: {
        riderProfileId: updatedProfile.id,
        phoneNumber: updatedProfile.emergencyPhone,
        shareMode: updatedProfile.emergencyPhone ? shareMode : 'DISABLED',
        status: updatedProfile.emergencyPhone ? 'READY' : 'MISSING',
        safetyNote: updatedProfile.emergencyPhone
          ? 'Contact de confiance configure et audite.'
          : 'Aucun contact de confiance actif.',
      },
      trustedContacts: updatedProfile.emergencyPhone
        ? [
            {
              label: 'Contact principal',
              phoneNumber: updatedProfile.emergencyPhone,
              priority: 1,
              isActive: true,
            },
          ]
        : [],
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

  private serializeTrustedContacts(
    contacts: Array<{
      label: string;
      phoneNumber: string;
      priority: number;
      isActive: boolean;
    }>,
    fallbackEmergencyPhone: string | null,
  ) {
    if (contacts.length > 0) {
      return contacts
        .filter((contact) => contact.isActive)
        .map((contact) => ({
          label: contact.label,
          phoneNumber: contact.phoneNumber,
          priority: contact.priority,
          isActive: contact.isActive,
        }));
    }

    if (!fallbackEmergencyPhone) {
      return [];
    }

    return [
      {
        label: 'Contact principal',
        phoneNumber: fallbackEmergencyPhone,
        priority: 1,
        isActive: true,
      },
    ];
  }
}
