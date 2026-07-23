import { Controller, Get, Query } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get('offers')
  listOffers(
    @Query('category') category?: string,
    @Query('benefitType') benefitType?: string,
  ) {
    return this.merchants.listActiveOffers({ category, benefitType });
  }

  @Get('categories')
  listCategories() {
    return this.merchants.listCategories();
  }
}
