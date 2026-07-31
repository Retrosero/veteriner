/**
 * @file JobRuns modülü.
 * @module apps/api/modules/job-runs/job-runs.module
 *
 * @description GOAL-102 (FAZ-10) background job ve entegrasyon
 * logları feature modülü. Global değil; SUPERADMIN controller'ı
 * + service + repository tek noktadan dışa açılır.
 *
 * Cross-module:
 * - AuditService (henüz kullanılmıyor; Faz 10+ log/audit
 *   entegrasyonu sonraki tick'te).
 * - PiiMasker (common/logging; payload sanitization).
 * - ErrorEventsService (cross-correlation; opsiyonel).
 *
 * @since GOAL-102 (FAZ-10) background job ve entegrasyon logları core
 */

import { Module } from "@nestjs/common";

import { JobRunsController } from "./job-runs.controller.js";
import { JobRunsRepository } from "./job-runs.repository.js";
import { JobRunsService } from "./job-runs.service.js";

@Module({
  controllers: [JobRunsController],
  providers: [JobRunsService, JobRunsRepository],
  exports: [JobRunsService, JobRunsRepository],
})
export class JobRunsModule {}
