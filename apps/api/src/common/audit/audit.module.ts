/**
 * @file Audit modülü.
 * @module apps/api/common/audit/audit.module
 *
 * @description NestJS modülü olarak AuditService'i DI container'a
 * ekler. Global modül; her feature modülünden inject edilebilir.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 * @updated GOAL-010 (FAZ-1) PrismaService inject edildi
 */

import { Global, Module } from "@nestjs/common";

import { AuditService } from "./audit.service.js";

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
