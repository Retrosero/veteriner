/**
 * @file ControlledDrugs modülü.
 * @module apps/api/modules/controlled-drugs/controlled-drugs.module
 * @description GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri
 * feature modülü. Service + repository + controller DI'a eklenir.
 * `AuditModule` global modülden gelir.
 * @since GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri core
 */

import { Module } from "@nestjs/common";

import { ControlledDrugsController } from "./controlled-drugs.controller.js";
import { ControlledDrugsRepository } from "./controlled-drugs.repository.js";
import { ControlledDrugsService } from "./controlled-drugs.service.js";
import { AuditModule } from "../../common/audit/audit.module.js";
import { AuthModule } from "../../common/auth/auth.module.js";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ControlledDrugsController],
  providers: [ControlledDrugsService, ControlledDrugsRepository],
  exports: [ControlledDrugsService, ControlledDrugsRepository],
})
export class ControlledDrugsModule {}
