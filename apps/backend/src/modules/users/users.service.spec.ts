import { UsersService } from './users.service';

describe('UsersService', () => {
  function createService() {
    const prisma = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    return {
      prisma,
      service: new UsersService(prisma as never),
    };
  }

  it('returns paginated users with metadata', async () => {
    const { prisma, service } = createService();

    prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    prisma.user.count.mockResolvedValue(45);

    const result = await service.findAll({
      page: 2,
      pageSize: 10,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 45,
      pageCount: 5,
    });
    expect(result.data).toHaveLength(1);
  });
});
