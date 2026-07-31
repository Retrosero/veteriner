/**
 * @file ClinicalUsages modülü.
 * @module apps/api/modules/clinical-usages/clinical-usages.module
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü feature modülü. Cross-module: ProductsService (ürün
 * varlık/arşiv kontrolü) + StockMovementsService (clinical_use
 * hareketi).
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { Module } from "@nestjs/common";

import { ProductsModule } from "../products/products.module.js";
import { StockMovementsModule } from "../stock-movements/stock-movements.module.js";
import { ClinicalUsagesController } from "./clinical-usages.controller.js";
import { ClinicalUsagesRepository } from "./clinical-usages.repository.js";
import { ClinicalUsagesService } from "./clinical-usages.service.js";

@Module({
  imports: [ProductsModule, StockMovementsModule],
  controllers: [ClinicalUsagesController],
  providers: [ClinicalUsagesService, ClinicalUsagesRepository],
  exports: [ClinicalUsagesService, ClinicalUsagesRepository],
})
export class ClinicalUsagesModule {}
