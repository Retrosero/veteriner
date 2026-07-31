/**
 * @file CashRegister modülü.
 * @module apps/api/modules/cash-register/cash-register.module
 *
 * @description GOAL-074 (FAZ-7) kasa ve gün sonu feature modülü.
 *   Cross-module bağımlılıkları:
 *   - `AuditService` (global) — audit log.
 *   - `KasaRepository` (PaymentsModule export) — kasa ledger
 *     read-only (movements + summary).
 *
 * @since GOAL-074 (FAZ-7) kasa ve gün sonu core
 */

import { Module } from "@nestjs/common";

import { AuditModule } from "../../common/audit/audit.module.js";
import { PaymentsModule } from "../payments/payments.module.js";

import { CashRegisterController } from "./cash-register.controller.js";
import { CashRegisterRepository } from "./cash-register.repository.js";
import { CashRegisterService } from "./cash-register.service.js";

@Module({
  imports: [AuditModule, PaymentsModule],
  controllers: [CashRegisterController],
  providers: [CashRegisterService, CashRegisterRepository],
  exports: [CashRegisterService, CashRegisterRepository],
})
export class CashRegisterModule {}
