/**
 * @file Suppliers modülü.
 * @module apps/api/modules/suppliers/suppliers.module
 *
 * @description GOAL-062 (FAZ-6) tedarikçi kataloğu feature modülü.
 * Service + repository + controller DI'a eklenir. AuditService
 * global modülden gelir.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { Module } from "@nestjs/common";

import { SuppliersController } from "./suppliers.controller.js";
import { SuppliersRepository } from "./suppliers.repository.js";
import { SuppliersService } from "./suppliers.service.js";

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService, SuppliersRepository],
  exports: [SuppliersService, SuppliersRepository],
})
export class SuppliersModule {}
