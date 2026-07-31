/**
 * @file ClinicalConsumption (klinik tüketim) modülü.
 * @module apps/api/modules/clinical-consumption/clinical-consumption.module
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü feature modülü. Service + repository + controller DI'a
 * eklenir.
 *
 * Cross-module bağımlılıklar:
 * - `ProductsModule` — ürün varlık/arşiv kontrolü.
 * - `InventoryModule` — lot varlık/arşiv kontrolü.
 * - `StockMovementsModule` — stok düşümü ve ters kayıt.
 * - `AuditModule` — audit trail kaydı.
 *
 * Dış modüller tarafından tüketim:
 * - `PrescriptionsModule` — reçete dispense anında
 *   `recordForPrescription` çağrısı (otomatik stok düşümü).
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { Module } from "@nestjs/common";

import { AuditModule } from "../../common/audit/audit.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { ProductsModule } from "../products/products.module.js";
import { StockMovementsModule } from "../stock-movements/stock-movements.module.js";

import { ClinicalConsumptionController } from "./clinical-consumption.controller.js";
import { ClinicalConsumptionRepository } from "./clinical-consumption.repository.js";
import { ClinicalConsumptionService } from "./clinical-consumption.service.js";

@Module({
  imports: [
    AuditModule,
    ProductsModule,
    InventoryModule,
    StockMovementsModule,
  ],
  controllers: [ClinicalConsumptionController],
  providers: [ClinicalConsumptionService, ClinicalConsumptionRepository],
  exports: [ClinicalConsumptionService, ClinicalConsumptionRepository],
})
export class ClinicalConsumptionModule {}
