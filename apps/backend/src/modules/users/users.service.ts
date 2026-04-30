import { Injectable } from '@nestjs/common';
import {
  PageQueryDto,
  resolvePageQuery,
} from '../../common/dto/page-query.dto';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PageQueryDto) {
    const { page, pageSize, skip, take } = resolvePageQuery(query);
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          riderProfile: true,
          driverProfile: true,
        },
      }),
      this.prisma.user.count(),
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
