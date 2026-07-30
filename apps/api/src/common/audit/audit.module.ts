/**
 * @file Audit modülü.
 * @module apps/api/common/audit/audit.module
 *
 * @description NestJS modülü olarak AuditService'i DI
 * container'a ekler. FAZ-0'da global modül; gerçek DB
 * yazımı için PrismaModule import edilir (GOAL-010+).
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import { Global, Module } from "@nestjs/common";

import { AuditService } from "./audit.service.js";

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
