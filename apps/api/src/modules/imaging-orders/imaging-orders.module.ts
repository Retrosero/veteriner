/**
 * @file Imaging orders modülü.
 * @module apps/api/modules/imaging-orders/imaging-orders.module
 *
 * @description GOAL-093 (FAZ-9) görüntüleme isteği feature modülü.
 * Audit altyapısı global modül olduğu için ek bir import gerekmez.
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 */

import { Module } from "@nestjs/common";

import { ImagingOrdersController } from "./imaging-orders.controller.js";
import { ImagingOrdersRepository } from "./imaging-orders.repository.js";
import { ImagingOrdersService } from "./imaging-orders.service.js";

@Module({
  controllers: [ImagingOrdersController],
  providers: [ImagingOrdersService, ImagingOrdersRepository],
  exports: [ImagingOrdersService, ImagingOrdersRepository],
})
export class ImagingOrdersModule {}
