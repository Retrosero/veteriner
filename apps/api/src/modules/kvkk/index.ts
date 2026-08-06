/**
 * @file KVKK modülü barrel export.
 * @module apps/api/modules/kvkk
 * @since GOAL-126 (FAZ-12)
 */

export { KvkkModule } from "./kvkk.module.js";
export { KvkkController } from "./kvkk.controller.js";
export { KvkkService } from "./kvkk.service.js";
export {
  ErasureRequestsRepository,
  type ErasureRequestRecord,
} from "./erasure-requests.repository.js";
export * from "./dto/index.js";
