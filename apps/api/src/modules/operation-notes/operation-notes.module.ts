/**
 * @file OperationNotes modülü.
 * @module apps/api/modules/operation-notes/operation-notes.module
 *
 * @description GOAL-083 (FAZ-8) ameliyat operasyon notu feature
 * modülü. Cross-module:
 * - SurgeryPlansModule (plan in_progress kontrolü).
 * - StockMovementsModule (finalize'da clinical_use stock movement).
 *
 * @since GOAL-083 (FAZ-8) operasyon notu ve kullanılan malzemeler core
 */

import { Module } from "@nestjs/common";

import { OperationNotesController } from "./operation-notes.controller.js";
import { OperationNotesRepository } from "./operation-notes.repository.js";
import { OperationNotesService } from "./operation-notes.service.js";
import { SurgeryPlansModule } from "../surgery-plans/surgery-plans.module.js";
import { StockMovementsModule } from "../stock-movements/stock-movements.module.js";

@Module({
  imports: [SurgeryPlansModule, StockMovementsModule],
  controllers: [OperationNotesController],
  providers: [OperationNotesService, OperationNotesRepository],
  exports: [OperationNotesService, OperationNotesRepository],
})
export class OperationNotesModule {}
