/**
 * @file Lab test kataloğu modülü.
 * @module apps/api/modules/lab-tests/lab-tests.module
 *
 * @description GOAL-090 (FAZ-9) laboratuvar test kataloğu feature
 * modülü. W1.2a kapsamında PrismaService bağımlılığı eklendi.
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 * @w1.2a DB persistence (in-memory → Prisma)
 */

import { Module } from "@nestjs/common";

import { LabTestsController } from "./lab-tests.controller.js";
import { LabTestsRepository } from "./lab-tests.repository.js";
import { LabTestsService } from "./lab-tests.service.js";
import { PrismaModule } from "../../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [LabTestsController],
  providers: [LabTestsService, LabTestsRepository],
  exports: [LabTestsService, LabTestsRepository],
})
export class LabTestsModule {}
