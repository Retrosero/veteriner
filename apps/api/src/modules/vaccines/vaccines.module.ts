/**
 * @file Vaccines modülü.
 * @module apps/api/modules/vaccines/vaccines.module
 *
 * @description GOAL-050 aşı kataloğu ve protokol yönetimi feature
 * modülü. Service + repository + controller DI'a eklenir.
 * AuditService global modülden gelir.
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

import { Module } from "@nestjs/common";

import { VaccinesController } from "./vaccines.controller.js";
import { VaccinesService } from "./vaccines.service.js";
import { VaccinesRepository } from "./vaccines.repository.js";

@Module({
  controllers: [VaccinesController],
  providers: [VaccinesService, VaccinesRepository],
  exports: [VaccinesService, VaccinesRepository],
})
export class VaccinesModule {}
