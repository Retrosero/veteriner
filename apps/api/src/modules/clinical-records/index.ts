/**
 * @file Clinical records modülü public API.
 * @module apps/api/modules/clinical-records
 *
 * @since GOAL-047 (FAZ-4) klinik kayıt PDF ve paylaşım core
 */

export { ClinicalRecordsModule } from "./clinical-records.module.js";
export { ClinicalRecordsService } from "./clinical-records.service.js";
export { ClinicalRecordsController } from "./clinical-records.controller.js";
export {
  ClinicalRecordSharesRepository,
  type ClinicalRecordShareRecord,
} from "./clinical-records.repository.js";
