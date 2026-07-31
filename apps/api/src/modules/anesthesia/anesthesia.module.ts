/**
 * @file Anesthesia modülü.
 * @module apps/api/modules/anesthesia/anesthesia.module
 *
 * @description GOAL-082 (FAZ-8) ameliyat içi anestezi takip feature
 * modülü. Cross-module: SurgeryPlansModule (plan durum kontrolü).
 *
 * @since GOAL-082 (FAZ-8) anestezi takip core
 */

import { Module } from "@nestjs/common";

import { AnesthesiaController } from "./anesthesia.controller.js";
import { AnesthesiaRepository } from "./anesthesia.repository.js";
import { AnesthesiaService } from "./anesthesia.service.js";
import { SurgeryPlansModule } from "../surgery-plans/surgery-plans.module.js";

@Module({
  imports: [SurgeryPlansModule],
  controllers: [AnesthesiaController],
  providers: [AnesthesiaService, AnesthesiaRepository],
  exports: [AnesthesiaService, AnesthesiaRepository],
})
export class AnesthesiaModule {}
