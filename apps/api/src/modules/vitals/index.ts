/**
 * @file Vitals modülü public API.
 * @module apps/api/modules/vitals
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

export { VitalsModule } from "./vitals.module.js";
export { VitalsService } from "./vitals.service.js";
export { VitalsController } from "./vitals.controller.js";
export {
  VitalsRepository,
  type VitalsPersistRecord,
} from "./vitals.repository.js";
