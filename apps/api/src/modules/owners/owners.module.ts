/**
 * @file Owners modülü.
 * @module apps/api/modules/owners/owners.module
 *
 * @description Owner feature modülü. Service + repository +
 * controller DI'a eklenir. AuditService global modülden gelir.
 *
 * @since GOAL-020 (FAZ-2) hasta sahibi core
 */

import { Module } from "@nestjs/common";

import { OwnersController } from "./owners.controller.js";
import { OwnersRepository } from "./owners.repository.js";
import { OwnersService } from "./owners.service.js";

@Module({
  controllers: [OwnersController],
  providers: [OwnersService, OwnersRepository],
  exports: [OwnersService, OwnersRepository],
})
export class OwnersModule {}
