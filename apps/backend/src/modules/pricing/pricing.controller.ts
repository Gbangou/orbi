import { Controller, Get, Query, Version } from '@nestjs/common';
import { EstimatePricingQueryDto } from './dto/estimate-pricing-query.dto';
import { PricingService } from './pricing.service';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('rules')
  @Version('1')
  listRules() {
    return this.pricingService.listRules();
  }

  @Get('estimate')
  @Version('1')
  estimate(@Query() query: EstimatePricingQueryDto) {
    return this.pricingService.estimate(query);
  }

  @Get('ride-options')
  @Version('1')
  rideOptions(@Query() query: EstimatePricingQueryDto) {
    return this.pricingService.estimateRideOptions(query);
  }
}
