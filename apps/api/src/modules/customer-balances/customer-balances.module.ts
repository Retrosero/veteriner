/**
 * @file CustomerBalances modülü.
 * @module apps/api/modules/customer-balances/customer-balances.module
 * @description GOAL-075 (FAZ-7) müşteri borç/alacak görünümü
 * feature modülü. Cross-module read-only.
 * @since GOAL-075 (FAZ-7) müşteri borç/alacak görünümü core
 */

import { Module } from "@nestjs/common";

import { CustomerBalancesController } from "./customer-balances.controller.js";
import { CustomerBalancesService } from "./customer-balances.service.js";
import { ClinicSalesModule } from "../clinic-sales/clinic-sales.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PetshopSalesModule } from "../petshop-sales/petshop-sales.module.js";

@Module({
  imports: [ClinicSalesModule, PetshopSalesModule, PaymentsModule],
  controllers: [CustomerBalancesController],
  providers: [CustomerBalancesService],
  exports: [CustomerBalancesService],
})
export class CustomerBalancesModule {}
