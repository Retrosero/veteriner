/**
 * @file Patients modülü public API.
 * @module apps/api/modules/patients
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 */

export { PatientsModule } from "./patients.module.js";
export { PatientsService } from "./patients.service.js";
export { PatientsRepository } from "./patients.repository.js";
export { PatientsController } from "./patients.controller.js";
export type { PatientRecord } from "./patients.repository.js";
