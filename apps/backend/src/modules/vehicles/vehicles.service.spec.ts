import { VehiclesService } from './vehicles.service';

describe('VehiclesService', () => {
  function createService() {
    const prisma = {
      vehicle: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    return {
      prisma,
      service: new VehiclesService(prisma as never),
    };
  }

  it('returns paginated vehicles with metadata', async () => {
    const { prisma, service } = createService();

    prisma.vehicle.findMany.mockResolvedValue([{ id: 'vehicle-1' }]);
    prisma.vehicle.count.mockResolvedValue(21);

    const result = await service.findAll({
      page: 1,
      pageSize: 5,
    });

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 5,
      }),
    );
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 5,
      total: 21,
      pageCount: 5,
    });
    expect(result.data).toHaveLength(1);
  });
});
