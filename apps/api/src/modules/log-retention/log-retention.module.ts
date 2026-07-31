/**
 * @file Log retention modülü.
 * @module apps/api/modules/log-retention/log-retention.module
 *
 * @description GOAL-106 (FAZ-10) PII maskeleme ve log retention
 * feature modülü. Service + repository + 3 retention target provider
 * DI'a eklenir. LogRetentionService global olarak dışa açılır;
 * scheduled sweep için başka modüller tarafından çağrılabilir.
 *
 * Cross-module:
 * - ErrorEventRetentionTarget → ErrorEventsRepository
 * - SecurityEventRetentionTarget → SecurityEventsRepository
 * - JobRunRetentionTarget → JobRunsRepository
 * - PiiMasker (common/logging) arşivleme sırasında payload
 *   sanitization için kullanılır.
 *
 * audit_log / notification / request_log logType'ları için henüz
 * target tanımlı değildir (Faz 10+ audit modülü + bildirim
 * servisi); sweep sırasında bu tipler için bucket boş döner.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import { Global, Module } from "@nestjs/common";

import { ErrorEventsModule } from "../error-events/error-events.module.js";
import { JobRunsModule } from "../job-runs/job-runs.module.js";
import { SecurityEventsModule } from "../security-events/security-events.module.js";
import { LogRetentionController } from "./log-retention.controller.js";
import { LogRetentionRepository } from "./log-retention.repository.js";
import { LogRetentionService } from "./log-retention.service.js";
import { LOG_RETENTION_TARGETS } from "./log-retention.targets.js";
import { ErrorEventRetentionTarget } from "./targets/error-event.target.js";
import { JobRunRetentionTarget } from "./targets/job-run.target.js";
import { SecurityEventRetentionTarget } from "./targets/security-event.target.js";

@Global()
@Module({
  imports: [ErrorEventsModule, SecurityEventsModule, JobRunsModule],
  controllers: [LogRetentionController],
  providers: [
    LogRetentionRepository,
    LogRetentionService,
    ErrorEventRetentionTarget,
    SecurityEventRetentionTarget,
    JobRunRetentionTarget,
    {
      // Retention target listesi tek token altında toplanır.
      provide: LOG_RETENTION_TARGETS,
      useFactory: (
        a: ErrorEventRetentionTarget,
        b: SecurityEventRetentionTarget,
        c: JobRunRetentionTarget,
      ): Array<
        ErrorEventRetentionTarget | SecurityEventRetentionTarget | JobRunRetentionTarget
      > => [a, b, c],
      inject: [
        ErrorEventRetentionTarget,
        SecurityEventRetentionTarget,
        JobRunRetentionTarget,
      ],
    },
  ],
  exports: [LogRetentionService, LogRetentionRepository],
})
export class LogRetentionModule {}
