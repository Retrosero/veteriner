/**
 * @file KVKK modülü.
 * @module apps/api/common/kvkk/kvkk.module
 *
 * @description KvkkService'i DI'a bağlar.
 *
 * @since GOAL-126 (FAZ-12) KVKK ve veri yaşam döngüsü
 */

import { Module } from "@nestjs/common";

import { KvkkService } from "./kvkk.service.js";

@Module({
  providers: [KvkkService],
  exports: [KvkkService],
})
export class KvkkModule {}
