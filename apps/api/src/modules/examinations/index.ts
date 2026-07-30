/**
 * @file Examinations modülü public API.
 * @module apps/api/modules/examinations
 *
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
 */

export { ExaminationsModule } from "./examinations.module.js";
export { ExaminationsService } from "./examinations.service.js";
export { ExaminationsController } from "./examinations.controller.js";
export {
  ExaminationsRepository,
  ExaminationAmendsRepository,
  type ExaminationRecord,
  type ExaminationAmendRecord,
} from "./examinations.repository.js";
