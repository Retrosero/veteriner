/**
 * @file Inventory (depo/raf/lot) modülü.
 * @module apps/api/modules/inventory/inventory.module
 *
 * @description GOAL-061 (FAZ-6) depo, raf, lot ve SKT feature
 * modülü. Service + repository + controller DI'a eklenir.
 * AuditService global modülden gelir.
 *
 * Stok miktarı bu modülde TUTULMAZ; miktar GOAL-063+ (stok
 * hareketleri) ile ayrı bir modülde yönetilecek. Buradaki
 * miktar alanı yalnızca lot alındığındaki başlangıç miktarıdır.
 *
 * @since GOAL-061 (FAZ-6) depo, raf, lot ve SKT core
 */

import { Module } from "@nestjs/common";

import { AuditModule } from "../../common/audit/audit.module.js";

import { InventoryController } from "./inventory.controller.js";
import { InventoryRepository } from "./inventory.repository.js";
import { InventoryService } from "./inventory.service.js";

@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
  exports: [InventoryService, InventoryRepository],
})
export class InventoryModule {}
