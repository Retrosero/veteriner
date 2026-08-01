/**
 * @file Stock Alerts modülü.
 * @module apps/api/modules/stock-alerts/stock-alerts.module
 *
 * @description GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları feature
 * modülü. Cross-module bağımlılıkları:
 * - `ProductsService` — ürün kataloğu + `lowStockThreshold` (FAZ-6
 *   GOAL-067 eklendi).
 * - `InventoryService` — lot listesi (SKT takibi).
 * - `StockMovementsService` — net bakiye hesabı (ürün/lot bazında).
 * - `AuditService` (global) — audit log.
 *
 * Service + repository + controller DI'a eklenir.
 *
 * @since GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları core
 */

import { Module } from "@nestjs/common";

import { StockAlertAcksRepository } from "./stock-alert-acks.repository.js";
import { StockAlertsController } from "./stock-alerts.controller.js";
import { StockAlertsService } from "./stock-alerts.service.js";
import { AuditModule } from "../../common/audit/audit.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { ProductsModule } from "../products/products.module.js";
import { StockMovementsModule } from "../stock-movements/stock-movements.module.js";

@Module({
  imports: [AuditModule, ProductsModule, InventoryModule, StockMovementsModule],
  controllers: [StockAlertsController],
  providers: [StockAlertsService, StockAlertAcksRepository],
  exports: [StockAlertsService, StockAlertAcksRepository],
})
export class StockAlertsModule {}
