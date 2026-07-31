/**
 * @file StockMovement (stok hareketi) modülü.
 * @module apps/api/modules/stock-movements/stock-movements.module
 *
 * @description GOAL-063 (FAZ-6) stok hareketleri ve sayım feature
 * modülü. 9 hareket türü (purchase, sale, clinical_use, vaccination,
 * return, transfer, count_adjustment, waste, reversal) için ortak
 * append-only hareket tablosu. Service + repository + controller
 * DI'a eklenir.
 *
 * Cross-module bağımlılıklar:
 * - `ProductsModule` — ürün varlık/arşiv kontrolü.
 * - `InventoryModule` — lot varlık/arşiv kontrolü.
 * - `AuditModule` — audit trail kaydı.
 *
 * @since GOAL-063 (FAZ-6) stok hareketleri ve sayım core
 */

import { Module } from "@nestjs/common";

import { AuditModule } from "../../common/audit/audit.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { ProductsModule } from "../products/products.module.js";

import { StockMovementsController } from "./stock-movements.controller.js";
import { StockMovementsRepository } from "./stock-movements.repository.js";
import { StockMovementsService } from "./stock-movements.service.js";

@Module({
  imports: [AuditModule, ProductsModule, InventoryModule],
  controllers: [StockMovementsController],
  providers: [StockMovementsService, StockMovementsRepository],
  exports: [StockMovementsService, StockMovementsRepository],
})
export class StockMovementsModule {}
