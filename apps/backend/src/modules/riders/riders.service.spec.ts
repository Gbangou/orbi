import { NotFoundException } from '@nestjs/common';
import { RidersService } from './riders.service';

describe('RidersService', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn(),
      riderProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      riderTrustedContact: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      savedPlace: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      rideRequest: {
        count: jest.fn(),
      },
      trip: {
        count: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    return {
      prisma,
      service: new RidersService(prisma as never),
    };
  }

  it('returns the authenticated rider profile with saved places and stats', async () => {
    const { prisma, service } = createService();

    prisma.riderProfile.findUnique.mockResolvedValue({
      id: 'rider-1',
      emergencyPhone: '+22670000001',
      trustedContactShareMode: 'ALL_TRIPS',
      preferredTier: 'MOTO_STANDARD',
      trustedContacts: [
        {
          id: 'trusted-contact-1',
          label: 'Contact principal',
          phoneNumber: '+22670000001',
          priority: 1,
          isActive: true,
        },
      ],
      savedPlaces: [
        {
          id: 'place-1',
          label: 'Maison',
          address: 'Patte d Oie',
          latitude: 12.31,
          longitude: -1.52,
        },
      ],
      user: {
        fullName: 'Awa Rider',
        email: 'rider@orbi.app',
        phoneNumber: null,
      },
    });
    prisma.rideRequest.count.mockResolvedValue(7);
    prisma.trip.count.mockResolvedValueOnce(5).mockResolvedValueOnce(4);

    const result = await service.getMe({
      user: {
        riderProfile: {
          id: 'rider-1',
        },
      },
    } as never);

    expect(result.profile.fullName).toBe('Awa Rider');
    expect(result.profile.trustedContact).toEqual(
      expect.objectContaining({
        phoneNumber: '+22670000001',
        shareMode: 'ALL_TRIPS',
        status: 'READY',
      }),
    );
    expect(result.profile.trustedContacts).toEqual([
      {
        id: 'trusted-contact-1',
        label: 'Contact principal',
        phoneNumber: '+22670000001',
        priority: 1,
        isActive: true,
      },
    ]);
    expect(result.profile.stats.totalRideRequests).toBe(7);
    expect(result.profile.stats.totalTrips).toBe(5);
    expect(result.profile.stats.completedTrips).toBe(4);
    expect(result.profile.savedPlaces[0]).toEqual(
      expect.objectContaining({
        label: 'Maison',
        address: 'Patte d Oie',
      }),
    );
  });

  it('updates and audits the rider trusted contact', async () => {
    const { prisma, service } = createService();

    prisma.riderProfile.update.mockResolvedValue({
      id: 'rider-1',
      emergencyPhone: '+22670000001',
      trustedContactShareMode: 'ALL_TRIPS',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateTrustedContact(
      {
        user: {
          id: 'user-rider-1',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      {
        phoneNumber: '+22670000001',
        shareMode: 'ALL_TRIPS',
        notes: 'Mere du rider',
      },
    );

    expect(prisma.riderProfile.update).toHaveBeenCalledWith({
      where: { id: 'rider-1' },
      data: {
        emergencyPhone: '+22670000001',
        trustedContactShareMode: 'ALL_TRIPS',
      },
    });
    expect(prisma.riderTrustedContact.updateMany).not.toHaveBeenCalled();
    expect(prisma.riderTrustedContact.upsert).toHaveBeenCalledWith({
      where: {
        riderId_phoneNumber: {
          riderId: 'rider-1',
          phoneNumber: '+22670000001',
        },
      },
      update: {
        label: 'Contact principal',
        priority: 1,
        isActive: true,
      },
      create: {
        riderId: 'rider-1',
        label: 'Contact principal',
        phoneNumber: '+22670000001',
        priority: 1,
        isActive: true,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-rider-1',
        action: 'RIDER_TRUSTED_CONTACT_UPDATED',
        entityType: 'RIDER_PROFILE',
        entityId: 'rider-1',
        metadata: expect.objectContaining({
          hasTrustedContact: true,
          shareMode: 'ALL_TRIPS',
          activeTrustedContacts: 1,
        }),
      }),
    });
    expect(result.trustedContact).toEqual(
      expect.objectContaining({
        phoneNumber: '+22670000001',
        shareMode: 'ALL_TRIPS',
        status: 'READY',
      }),
    );
  });

  it('creates and audits an additional trusted contact', async () => {
    const { prisma, service } = createService();

    prisma.riderTrustedContact.findMany
      .mockResolvedValueOnce([
        {
          id: 'trusted-contact-1',
          riderId: 'rider-1',
          label: 'Contact principal',
          phoneNumber: '+22670000001',
          priority: 1,
          isActive: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'trusted-contact-1',
          label: 'Contact principal',
          phoneNumber: '+22670000001',
          priority: 1,
          isActive: true,
        },
        {
          id: 'trusted-contact-2',
          label: 'Frere',
          phoneNumber: '+22670000002',
          priority: 2,
          isActive: true,
        },
      ]);
    prisma.riderProfile.findUnique.mockResolvedValue({
      trustedContactShareMode: 'ALL_TRIPS',
    });
    prisma.riderProfile.update.mockResolvedValue(undefined);
    prisma.riderTrustedContact.upsert.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.createTrustedContact(
      {
        user: {
          id: 'user-rider-1',
          riderProfile: { id: 'rider-1' },
        },
      } as never,
      {
        label: 'Frere',
        phoneNumber: '+22670000002',
      },
    );

    expect(prisma.riderTrustedContact.upsert).toHaveBeenCalledWith({
      where: {
        riderId_phoneNumber: {
          riderId: 'rider-1',
          phoneNumber: '+22670000002',
        },
      },
      update: {
        label: 'Frere',
        priority: 2,
        isActive: true,
      },
      create: {
        riderId: 'rider-1',
        label: 'Frere',
        phoneNumber: '+22670000002',
        priority: 2,
        isActive: true,
      },
    });
    expect(prisma.riderProfile.update).toHaveBeenCalledWith({
      where: { id: 'rider-1' },
      data: {
        emergencyPhone: '+22670000001',
        trustedContactShareMode: 'ALL_TRIPS',
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RIDER_TRUSTED_CONTACT_CREATED',
        entityType: 'RIDER_PROFILE',
        metadata: expect.objectContaining({
          priority: 2,
          activeTrustedContacts: 2,
        }),
      }),
    });
    expect(result.trustedContacts).toHaveLength(2);
  });

  it('updates trusted contact priority and resyncs the primary phone', async () => {
    const { prisma, service } = createService();

    prisma.riderTrustedContact.findUnique.mockResolvedValue({
      id: 'trusted-contact-2',
      riderId: 'rider-1',
      phoneNumber: '+22670000002',
      isActive: true,
    });
    prisma.riderTrustedContact.update.mockResolvedValue(undefined);
    prisma.riderProfile.findUnique.mockResolvedValue({
      trustedContactShareMode: 'NIGHT',
    });
    prisma.riderTrustedContact.findMany.mockResolvedValue([
      {
        id: 'trusted-contact-2',
        label: 'Frere',
        phoneNumber: '+22670000002',
        priority: 1,
        isActive: true,
      },
      {
        id: 'trusted-contact-1',
        label: 'Contact principal',
        phoneNumber: '+22670000001',
        priority: 2,
        isActive: true,
      },
    ]);
    prisma.riderProfile.update.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateTrustedContactEntry(
      {
        user: {
          id: 'user-rider-1',
          riderProfile: { id: 'rider-1' },
        },
      } as never,
      'trusted-contact-2',
      { priority: 1 },
    );

    expect(prisma.riderTrustedContact.update).toHaveBeenCalledWith({
      where: { id: 'trusted-contact-2' },
      data: {
        label: undefined,
        phoneNumber: undefined,
        priority: 1,
        isActive: undefined,
      },
    });
    expect(prisma.riderProfile.update).toHaveBeenCalledWith({
      where: { id: 'rider-1' },
      data: {
        emergencyPhone: '+22670000002',
        trustedContactShareMode: 'NIGHT',
      },
    });
    expect(result.trustedContacts[0]).toEqual(
      expect.objectContaining({
        id: 'trusted-contact-2',
        priority: 1,
      }),
    );
  });

  it('soft-deletes a trusted contact and falls back to manual mode when none remain', async () => {
    const { prisma, service } = createService();

    prisma.riderTrustedContact.findUnique.mockResolvedValue({
      id: 'trusted-contact-1',
      riderId: 'rider-1',
      phoneNumber: '+22670000001',
      isActive: true,
    });
    prisma.riderTrustedContact.update.mockResolvedValue(undefined);
    prisma.riderProfile.findUnique.mockResolvedValue({
      trustedContactShareMode: 'ALL_TRIPS',
    });
    prisma.riderTrustedContact.findMany.mockResolvedValue([]);
    prisma.riderProfile.update.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.deleteTrustedContact(
      {
        user: {
          id: 'user-rider-1',
          riderProfile: { id: 'rider-1' },
        },
      } as never,
      'trusted-contact-1',
    );

    expect(prisma.riderTrustedContact.update).toHaveBeenCalledWith({
      where: { id: 'trusted-contact-1' },
      data: { isActive: false },
    });
    expect(prisma.riderProfile.update).toHaveBeenCalledWith({
      where: { id: 'rider-1' },
      data: {
        emergencyPhone: null,
        trustedContactShareMode: 'MANUAL',
      },
    });
    expect(result).toEqual({
      deleted: true,
      trustedContactId: 'trusted-contact-1',
      trustedContacts: [],
    });
  });

  it('creates a saved place for the authenticated rider', async () => {
    const { prisma, service } = createService();

    prisma.savedPlace.create.mockResolvedValue({
      id: 'place-2',
      label: 'Marche',
      address: 'Grand Marche, Ouagadougou',
      latitude: 12.365,
      longitude: -1.534,
    });

    const result = await service.createSavedPlace(
      {
        user: {
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      {
        label: 'Marche',
        address: 'Grand Marche, Ouagadougou',
        latitude: 12.365,
        longitude: -1.534,
      },
    );

    expect(prisma.savedPlace.create).toHaveBeenCalledWith({
      data: {
        riderId: 'rider-1',
        label: 'Marche',
        address: 'Grand Marche, Ouagadougou',
        latitude: 12.365,
        longitude: -1.534,
      },
    });
    expect(result.savedPlace.id).toBe('place-2');
  });

  it('updates a saved place owned by the authenticated rider', async () => {
    const { prisma, service } = createService();

    prisma.savedPlace.findUnique.mockResolvedValue({
      id: 'place-1',
      riderId: 'rider-1',
    });
    prisma.savedPlace.update.mockResolvedValue({
      id: 'place-1',
      label: 'Maison',
      address: 'Patte d Oie, Ouagadougou',
      latitude: 12.34,
      longitude: -1.56,
    });

    const result = await service.updateSavedPlace(
      {
        user: {
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'place-1',
      {
        address: 'Patte d Oie, Ouagadougou',
        latitude: 12.34,
        longitude: -1.56,
      },
    );

    expect(prisma.savedPlace.update).toHaveBeenCalledWith({
      where: { id: 'place-1' },
      data: {
        label: undefined,
        address: 'Patte d Oie, Ouagadougou',
        latitude: 12.34,
        longitude: -1.56,
      },
    });
    expect(result.savedPlace.address).toBe('Patte d Oie, Ouagadougou');
  });

  it('does not update a saved place owned by another rider', async () => {
    const { prisma, service } = createService();

    prisma.savedPlace.findUnique.mockResolvedValue({
      id: 'place-1',
      riderId: 'rider-2',
    });

    await expect(
      service.updateSavedPlace(
        {
          user: {
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        'place-1',
        {
          label: 'Maison',
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.savedPlace.update).not.toHaveBeenCalled();
  });

  it('deletes a saved place owned by the authenticated rider', async () => {
    const { prisma, service } = createService();

    prisma.savedPlace.findUnique.mockResolvedValue({
      id: 'place-1',
      riderId: 'rider-1',
    });
    prisma.savedPlace.delete.mockResolvedValue(undefined);

    const result = await service.deleteSavedPlace(
      {
        user: {
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'place-1',
    );

    expect(prisma.savedPlace.delete).toHaveBeenCalledWith({
      where: { id: 'place-1' },
    });
    expect(result).toEqual({
      deleted: true,
      savedPlaceId: 'place-1',
    });
  });

  it('does not delete a saved place owned by another rider', async () => {
    const { prisma, service } = createService();

    prisma.savedPlace.findUnique.mockResolvedValue({
      id: 'place-1',
      riderId: 'rider-2',
    });

    await expect(
      service.deleteSavedPlace(
        {
          user: {
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        'place-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.savedPlace.delete).not.toHaveBeenCalled();
  });
});
