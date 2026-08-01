/**
 * @file Orders modülü.
 * @module apps/api/modules/orders/orders.module
 *
 * @description GOAL-044 tedavi planı + klinik order feature modülü.
 * Service + repository + controller DI'a eklenir. ExaminationsService
 * (GOAL-040) order oluşturma sırasında examination doğrulaması için
 * kullanılır. AuditService global modülden gelir.
 *
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
 */

import { Module } from "@nestjs/common";

import { OrdersController } from "./orders.controller.js";
import { OrdersRepository } from "./orders.repository.js";
import { OrdersService } from "./orders.service.js";
import { ExaminationsModule } from "../examinations/examinations.module.js";

@Module({
  imports: [ExaminationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
