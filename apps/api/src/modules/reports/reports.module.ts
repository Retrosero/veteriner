/**
 * @file Reports modülü.
 * @module apps/api/modules/reports/reports.module
 *
 * @description GOAL-076 (FAZ-7) temel finans raporları feature
 * modülü. Cross-module: ClinicSalesService + PetshopSalesService
 * + PaymentsService (read-only).
 *
 * @since GOAL-076 (FAZ-7) temel finans raporları core
 */

import { Module } from "@nestjs/common";

import { ClinicSalesModule } from "../clinic-sales/clinic-sales.module.js";
import { PetshopSalesModule } from "../petshop-sales/petshop-sales.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  imports: [ClinicSalesModule, PetshopSalesModule, PaymentsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
