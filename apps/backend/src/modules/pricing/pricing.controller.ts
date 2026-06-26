import { Controller, Get, Query, UseInterceptors, Version } from '@nestjs/common';
import { ResponseCacheInterceptor } from '../../common/cache/response-cache.interceptor';
import { EstimatePricingQueryDto } from './dto/estimate-pricing-query.dto';
import { PricingService } from './pricing.service';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('rules')
  @Version('1')
  @UseInterceptors(ResponseCacheInterceptor)
  listRules() {
    return this.pricingService.listRules();
  }

  @Get('estimate')
  @Version('1')
  @UseInterceptors(ResponseCacheInterceptor)
  estimate(@Query() query: EstimatePricingQueryDto) {
    return this.pricingService.estimate(query);
  }

  @Get('ride-options')
  @Version('1')
  @UseInterceptors(ResponseCacheInterceptor)
  rideOptions(@Query() query: EstimatePricingQueryDto) {
    return this.pricingService.estimateRideOptions(query);
  }
}
