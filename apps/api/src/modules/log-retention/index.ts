/**
 * @file Log retention modülü public re-export.
 * @module apps/api/modules/log-retention/index
 *
 * @description Nest modülü tüketicileri için barrel export.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

export { LogRetentionModule } from "./log-retention.module.js";
export { LogRetentionService } from "./log-retention.service.js";
export { LogRetentionRepository } from "./log-retention.repository.js";
export {
  LOG_RETENTION_TARGETS,
  type LogRetentionTarget,
  type ExpireOlderThanArgs,
  type CountOlderThanArgs,
} from "./log-retention.targets.js";
export { LogRetentionController } from "./log-retention.controller.js";
export { ErrorEventRetentionTarget } from "./targets/error-event.target.js";
export { SecurityEventRetentionTarget } from "./targets/security-event.target.js";
export { JobRunRetentionTarget } from "./targets/job-run.target.js";
