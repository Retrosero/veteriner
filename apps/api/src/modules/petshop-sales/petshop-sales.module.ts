/**
 * @file PetshopSales modülü.
 * @module apps/api/modules/petshop-sales/petshop-sales.module
 *
 * @description GOAL-064 (FAZ-6) petshop POS feature modülü.
 * Cross-module bağımlılıklar: ProductsService (ürün varlık/arşiv
 * kontrolü) + StockMovementsService (sale + reversal hareketleri).
 *
 * @since GOAL-064 (FAZ-6) petshop POS core
 */

import { Module } from "@nestjs/common";

import { ProductsModule } from "../products/products.module.js";
import { StockMovementsModule } from "../stock-movements/stock-movements.module.js";
import { PetshopSalesController } from "./petshop-sales.controller.js";
import { PetshopSalesRepository } from "./petshop-sales.repository.js";
import { PetshopSalesService } from "./petshop-sales.service.js";

@Module({
  imports: [ProductsModule, StockMovementsModule],
  controllers: [PetshopSalesController],
  providers: [PetshopSalesService, PetshopSalesRepository],
  exports: [PetshopSalesService, PetshopSalesRepository],
})
export class PetshopSalesModule {}
