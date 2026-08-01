/**
 * @file PurchaseOrders modülü.
 * @module apps/api/modules/purchase-orders/purchase-orders.module
 *
 * @description GOAL-062 (FAZ-6) satın alma siparişi feature modülü.
 * SuppliersService'e cross-module bağımlılığı vardır (tedarikçi
 * varlık + arşiv kontrolü için). AuditService global modülden gelir.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { Module } from "@nestjs/common";

import { PurchaseOrdersController } from "./purchase-orders.controller.js";
import { PurchaseOrdersRepository } from "./purchase-orders.repository.js";
import { PurchaseOrdersService } from "./purchase-orders.service.js";
import { SuppliersModule } from "../suppliers/suppliers.module.js";

@Module({
  imports: [SuppliersModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersRepository],
  exports: [PurchaseOrdersService, PurchaseOrdersRepository],
})
export class PurchaseOrdersModule {}
