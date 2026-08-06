/**
 * @file KVKK modülü.
 * @module apps/api/modules/kvkk/kvkk.module
 *
 * @description GOAL-126 (FAZ-12) KVKK ve veri yaşam döngüsü
 *   feature modülü. Controller + service + repository DI'a
 *   bağlanır. Ortak `KvkkService` (apps/api/src/common/kvkk)
 *   core logic sağlar; bu modül onu DB persistence ile sarmalayan
 *   bir feature-level facade sunar.
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

import { Module } from "@nestjs/common";

import { ErasureRequestsRepository } from "./erasure-requests.repository.js";
import { KvkkController } from "./kvkk.controller.js";
import { KvkkService } from "./kvkk.service.js";
import { PrismaModule } from "../../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [KvkkController],
  providers: [KvkkService, ErasureRequestsRepository],
  exports: [KvkkService, ErasureRequestsRepository],
})
export class KvkkModule {}
