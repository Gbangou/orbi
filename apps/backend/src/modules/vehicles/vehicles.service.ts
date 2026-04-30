import { Injectable } from '@nestjs/common';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PageQueryDto) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const [data, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        skip,
        take,
        include: {
          driverProfile: {
            include: {
              user: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.vehicle.count(),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }
}
