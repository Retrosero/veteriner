/**
 * @file Payments modülü.
 * @module apps/api/modules/payments/payments.module
 *
 * @description GOAL-072 (FAZ-7) tahsilat feature modülü.
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 */

import { Module } from "@nestjs/common";

import { PaymentsController } from "./payments.controller.js";
import { PaymentsRepository } from "./payments.repository.js";
import { PaymentsService } from "./payments.service.js";

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
