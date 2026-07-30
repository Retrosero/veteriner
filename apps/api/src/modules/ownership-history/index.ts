/**
 * @file Ownership history modülü public API.
 * @module apps/api/modules/ownership-history
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

export { OwnershipHistoryModule } from "./ownership-history.module.js";
export { OwnershipHistoryService } from "./ownership-history.service.js";
export { OwnershipHistoryRepository } from "./ownership-history.repository.js";
export { OwnershipHistoryController } from "./ownership-history.controller.js";
export type { OwnershipRecord } from "./ownership-history.repository.js";
