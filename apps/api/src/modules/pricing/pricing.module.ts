/**
 * @file Pricing modülü.
 * @module apps/api/modules/pricing/pricing.module
 *
 * @description GOAL-070 (FAZ-7) tenant bazlı fiyat listesi altyapısı
 * feature modülü. Cross-module bağımlılıkları:
 * - `ProductsService` — ürün varlık/arşiv kontrolü (item ekleme).
 * - `AuditService` (global) — audit log.
 *
 * Service + repository + controller DI'a eklenir.
 *
 * @since GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri core
 */

import { Module } from "@nestjs/common";

import { ProductsModule } from "../products/products.module.js";

import { PricingController, PricingProductController } from "./pricing.controller.js";
import { PricingRepository } from "./pricing.repository.js";
import { PricingService } from "./pricing.service.js";

@Module({
  imports: [ProductsModule],
  controllers: [PricingController, PricingProductController],
  providers: [PricingService, PricingRepository],
  exports: [PricingService, PricingRepository],
})
export class PricingModule {}
