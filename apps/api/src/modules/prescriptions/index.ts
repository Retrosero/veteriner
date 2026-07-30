/**
 * @file Prescriptions modülü public API.
 * @module apps/api/modules/prescriptions
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

export { PrescriptionsModule } from "./prescriptions.module.js";
export { PrescriptionsService } from "./prescriptions.service.js";
export { PrescriptionsController } from "./prescriptions.controller.js";
export {
  PrescriptionsRepository,
  type PrescriptionPatch,
} from "./prescriptions.repository.js";
