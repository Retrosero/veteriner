/**
 * @file Payments modülü.
 * @module apps/api/modules/payments/payments.module
 *
 * @description GOAL-072 (FAZ-7) tahsilat + GOAL-073 (FAZ-7) tahsilat
 * iptal ve ters kayıt feature modülü. Cross-module bağımlılıkları:
 * - `AuditService` (global) — audit log.
 *
 * Service + repository + controller DI'a eklenir.
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 * @updated GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
 */

import { Module } from "@nestjs/common";

import { KasaRepository } from "./kasa.repository.js";
import { PaymentReversalsRepository } from "./payment-reversals.repository.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsRepository } from "./payments.repository.js";
import { PaymentsService } from "./payments.service.js";
import { AuditModule } from "../../common/audit/audit.module.js";

@Module({
  imports: [AuditModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    PaymentReversalsRepository,
    KasaRepository,
  ],
  exports: [
    PaymentsService,
    PaymentsRepository,
    PaymentReversalsRepository,
    KasaRepository,
  ],
})
export class PaymentsModule {}
