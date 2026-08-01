/**
 * @file Lab results modülü.
 * @module apps/api/modules/lab-results/lab-results.module
 *
 * @description GOAL-092 (FAZ-9) laboratuvar sonucu feature modülü.
 * Order erişimi için `LabOrdersModule`'e bağımlı.
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 */

import { Module } from "@nestjs/common";

import { LabResultsController } from "./lab-results.controller.js";
import { LabResultsRepository } from "./lab-results.repository.js";
import { LabResultsService } from "./lab-results.service.js";
import { LabOrdersModule } from "../lab-orders/lab-orders.module.js";

@Module({
  imports: [LabOrdersModule],
  controllers: [LabResultsController],
  providers: [LabResultsService, LabResultsRepository],
  exports: [LabResultsService, LabResultsRepository],
})
export class LabResultsModule {}
