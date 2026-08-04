/**
 * @file Lab result modülü.
 * @module apps/api/modules/lab-results/lab-results.module
 *
 * @description GOAL-092 (FAZ-9) laboratuvar sonucu feature modülü.
 * W1.2c kapsamında PrismaService bağımlılığı eklendi.
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 * @w1.2c DB persistence (in-memory → Prisma)
 */

import { Module } from "@nestjs/common";

import { LabResultsController } from "./lab-results.controller.js";
import { LabResultsRepository } from "./lab-results.repository.js";
import { LabResultsService } from "./lab-results.service.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { LabOrdersModule } from "../lab-orders/lab-orders.module.js";

@Module({
  imports: [PrismaModule, LabOrdersModule],
  controllers: [LabResultsController],
  providers: [LabResultsService, LabResultsRepository],
  exports: [LabResultsService, LabResultsRepository],
})
export class LabResultsModule {}
