/**
 * @file Lab order modülü.
 * @module apps/api/modules/lab-orders/lab-orders.module
 *
 * @description GOAL-091 (FAZ-9) laboratuvar isteği feature modülü.
 * W1.2b kapsamında PrismaService bağımlılığı eklendi.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 * @w1.2b DB persistence (in-memory → Prisma)
 */

import { Module } from "@nestjs/common";

import { LabOrdersController } from "./lab-orders.controller.js";
import { LabOrdersRepository } from "./lab-orders.repository.js";
import { LabOrdersService } from "./lab-orders.service.js";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { LabTestsModule } from "../lab-tests/lab-tests.module.js";

@Module({
  imports: [PrismaModule, LabTestsModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService, LabOrdersRepository],
  exports: [LabOrdersService, LabOrdersRepository],
})
export class LabOrdersModule {}
