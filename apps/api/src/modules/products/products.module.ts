/**
 * @file Products modülü.
 * @module apps/api/modules/products/products.module
 *
 * @description GOAL-060 (FAZ-6) ürün ve hizmet kataloğu feature
 * modülü. Klinik + petshop ortak katalog; tek tip (Product) üzerinden
 * 5 tür (stock_product, medicine, vaccine, service, consumable) temsil
 * edilir. Service + repository + controller DI'a eklenir.
 * AuditService global modülden gelir.
 *
 * @since GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core
 */

import { Module } from "@nestjs/common";

import { ProductsController } from "./products.controller.js";
import { ProductsRepository } from "./products.repository.js";
import { ProductsService } from "./products.service.js";

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsService, ProductsRepository],
})
export class ProductsModule {}
