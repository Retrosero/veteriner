/**
 * @file SurgeryPlans modülü.
 * @module apps/api/modules/surgery-plans/surgery-plans.module
 *
 * @description GOAL-080 (FAZ-8) ameliyat planlama feature modülü.
 *
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
 */

import { Module } from "@nestjs/common";

import { SurgeryPlansController } from "./surgery-plans.controller.js";
import { SurgeryPlansRepository } from "./surgery-plans.repository.js";
import { SurgeryPlansService } from "./surgery-plans.service.js";

@Module({
  controllers: [SurgeryPlansController],
  providers: [SurgeryPlansService, SurgeryPlansRepository],
  exports: [SurgeryPlansService, SurgeryPlansRepository],
})
export class SurgeryPlansModule {}
