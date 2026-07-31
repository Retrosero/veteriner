/**
 * @file Vaccinations modülü public API.
 * @module apps/api/modules/vaccinations
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

export { VaccinationsModule } from "./vaccinations.module.js";
export { VaccinationsService } from "./vaccinations.service.js";
export { VaccinationsController } from "./vaccinations.controller.js";
export {
  VaccinationsRepository,
  type VaccinationPatch,
} from "./vaccinations.repository.js";
export {
  toVaccination,
  type VaccinationCreate,
  type VaccinationFilters,
  type VaccinationRecord,
  type VaccinationStatus,
} from "../../common/vaccinations/vaccination.types.js";
