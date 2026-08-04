/**
 * @file Imaging order modülü.
 * @module apps/api/modules/imaging-orders/imaging-orders.module
 *
 * @description GOAL-093 (FAZ-9) görüntüleme isteği feature modülü.
 * W1.2d kapsamında PrismaService bağımlılığı eklendi.
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 * @w1.2d DB persistence (in-memory → Prisma)
 */

import { Module } from "@nestjs/common";

import { ImagingOrdersController } from "./imaging-orders.controller.js";
import { ImagingOrdersRepository } from "./imaging-orders.repository.js";
import { ImagingOrdersService } from "./imaging-orders.service.js";
import { PrismaModule } from "../../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [ImagingOrdersController],
  providers: [ImagingOrdersService, ImagingOrdersRepository],
  exports: [ImagingOrdersService, ImagingOrdersRepository],
})
export class ImagingOrdersModule {}
