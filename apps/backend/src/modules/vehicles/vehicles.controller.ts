import { Controller, Get, Query, Version } from '@nestjs/common';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Version('1')
  findAll(@Query() query: PageQueryDto) {
    return this.vehiclesService.findAll(query);
  }
}
