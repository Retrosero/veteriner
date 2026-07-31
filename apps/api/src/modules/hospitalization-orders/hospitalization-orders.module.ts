/**
 * @file HospitalizationOrders modülü.
 * @module apps/api/modules/hospitalization-orders/hospitalization-orders.module
 *
 * @description GOAL-085 (FAZ-8) yatış order + uygulama kayıtları
 * feature modülü. Cross-module: HospitalizationModule (yatış
 * varlık kontrolü).
 *
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import { Module } from "@nestjs/common";

import { HospitalizationOrdersController } from "./hospitalization-orders.controller.js";
import { HospitalizationOrdersRepository } from "./hospitalization-orders.repository.js";
import { HospitalizationOrdersService } from "./hospitalization-orders.service.js";
import { HospitalizationModule } from "../hospitalization/hospitalization.module.js";

@Module({
  imports: [HospitalizationModule],
  controllers: [HospitalizationOrdersController],
  providers: [HospitalizationOrdersService, HospitalizationOrdersRepository],
  exports: [HospitalizationOrdersService, HospitalizationOrdersRepository],
})
export class HospitalizationOrdersModule {}
