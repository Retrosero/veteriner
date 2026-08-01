/**
 * @file Lab orders modülü.
 * @module apps/api/modules/lab-orders/lab-orders.module
 *
 * @description GOAL-091 (FAZ-9) laboratuvar isteği feature modülü.
 * Katalog erişimi için `LabTestsModule`'e bağımlı.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 */

import { Module } from "@nestjs/common";

import { LabOrdersController } from "./lab-orders.controller.js";
import { LabOrdersRepository } from "./lab-orders.repository.js";
import { LabOrdersService } from "./lab-orders.service.js";
import { LabTestsModule } from "../lab-tests/lab-tests.module.js";

@Module({
  imports: [LabTestsModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService, LabOrdersRepository],
  exports: [LabOrdersService, LabOrdersRepository],
})
export class LabOrdersModule {}
