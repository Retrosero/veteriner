/**
 * @file DischargeSummaries modülü.
 * @module apps/api/modules/discharge-summaries/discharge-summaries.module
 *
 * @description GOAL-086 (FAZ-8) gözlem + taburcu özeti feature
 * modülü. Cross-module: HospitalizationModule (yatış varlık kontrolü).
 *
 * @since GOAL-086 (FAZ-8) gözlem ve taburcu özeti core
 */

import { Module } from "@nestjs/common";

import { DischargeSummariesController } from "./discharge-summaries.controller.js";
import { DischargeSummariesRepository } from "./discharge-summaries.repository.js";
import { DischargeSummariesService } from "./discharge-summaries.service.js";
import { HospitalizationModule } from "../hospitalization/hospitalization.module.js";

@Module({
  imports: [HospitalizationModule],
  controllers: [DischargeSummariesController],
  providers: [DischargeSummariesService, DischargeSummariesRepository],
  exports: [DischargeSummariesService, DischargeSummariesRepository],
})
export class DischargeSummariesModule {}
