import {
  Controller,
  Get,
  ServiceUnavailableException,
  Version,
} from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Version('1')
  check() {
    return this.healthService.check();
  }

  @Get('live')
  @Version('1')
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  @Version('1')
  async ready() {
    const readiness = await this.healthService.ready();

    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}
