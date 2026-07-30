/**
 * @file Diagnoses modülü public API.
 * @module apps/api/modules/diagnoses
 *
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

export { DiagnosesModule } from "./diagnoses.module.js";
export { DiagnosesService } from "./diagnoses.service.js";
export { DiagnosesController } from "./diagnoses.controller.js";
export {
  DiagnosesRepository,
  type DiagnosisRecord,
} from "./diagnoses.repository.js";
