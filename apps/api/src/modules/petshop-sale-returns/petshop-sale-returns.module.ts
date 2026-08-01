/**
 * @file PetshopSaleReturns modülü.
 * @module apps/api/modules/petshop-sale-returns/petshop-sale-returns.module
 *
 * @description GOAL-065 (FAZ-6) petshop satış iadesi feature modülü.
 * Cross-module bağımlılıklar: PetshopSalesRepository (orijinal
 * satış + satır varlık kontrolü) + ProductsService (ürün varlık +
 * purchaseTracked) + InventoryService (lot varlık/arşiv/ürün
 * eşleşme kontrolü) + StockMovementsService (return hareketi).
 *
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import { Module } from "@nestjs/common";

import { PetshopSaleReturnsController } from "./petshop-sale-returns.controller.js";
import { PetshopSaleReturnsRepository } from "./petshop-sale-returns.repository.js";
import { PetshopSaleReturnsService } from "./petshop-sale-returns.service.js";
import { AuditModule } from "../../common/audit/audit.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PetshopSalesModule } from "../petshop-sales/petshop-sales.module.js";
import { ProductsModule } from "../products/products.module.js";
import { StockMovementsModule } from "../stock-movements/stock-movements.module.js";

@Module({
  imports: [
    PetshopSalesModule,
    ProductsModule,
    InventoryModule,
    StockMovementsModule,
    AuditModule,
  ],
  controllers: [PetshopSaleReturnsController],
  providers: [PetshopSaleReturnsService, PetshopSaleReturnsRepository],
  exports: [PetshopSaleReturnsService, PetshopSaleReturnsRepository],
})
export class PetshopSaleReturnsModule {}
