/**
 * @file Lab test kataloğu modülü.
 * @module apps/api/modules/lab-tests/lab-tests.module
 *
 * @description GOAL-090 (FAZ-9) laboratuvar test kataloğu feature
 * modülü.
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 */

import { Module } from "@nestjs/common";

import { LabTestsController } from "./lab-tests.controller.js";
import { LabTestsRepository } from "./lab-tests.repository.js";
import { LabTestsService } from "./lab-tests.service.js";

@Module({
  controllers: [LabTestsController],
  providers: [LabTestsService, LabTestsRepository],
  exports: [LabTestsService, LabTestsRepository],
})
export class LabTestsModule {}
