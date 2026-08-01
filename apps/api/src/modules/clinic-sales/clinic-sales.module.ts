/**
 * @file ClinicSales modülü.
 * @module apps/api/modules/clinic-sales/clinic-sales.module
 * @description GOAL-071 (FAZ-7) klinik satış taslağı feature modülü.
 * Cross-module: ProductsService (ürün varlık/arşiv + salePrice).
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
 */

import { Module } from "@nestjs/common";

import { ClinicSalesController } from "./clinic-sales.controller.js";
import { ClinicSalesRepository } from "./clinic-sales.repository.js";
import { ClinicSalesService } from "./clinic-sales.service.js";
import { ProductsModule } from "../products/products.module.js";

@Module({
  imports: [ProductsModule],
  controllers: [ClinicSalesController],
  providers: [ClinicSalesService, ClinicSalesRepository],
  exports: [ClinicSalesService, ClinicSalesRepository],
})
export class ClinicSalesModule {}
