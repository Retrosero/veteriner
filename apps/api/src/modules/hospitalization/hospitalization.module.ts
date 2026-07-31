/**
 * @file Hospitalization modülü.
 * @module apps/api/modules/hospitalization/hospitalization.module
 *
 * @description GOAL-084 (FAZ-8) yatış ve kafes yönetimi feature
 * modülü. 3 varlık (cage, hospitalization, cageAssignment) tek
 * modülde.
 *
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
 */

import { Module } from "@nestjs/common";

import { HospitalizationController } from "./hospitalization.controller.js";
import { HospitalizationRepository } from "./hospitalization.repository.js";
import { HospitalizationService } from "./hospitalization.service.js";

@Module({
  controllers: [HospitalizationController],
  providers: [HospitalizationService, HospitalizationRepository],
  exports: [HospitalizationService, HospitalizationRepository],
})
export class HospitalizationModule {}
