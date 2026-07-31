/**
 * @file Vaccines modülü public API.
 * @module apps/api/modules/vaccines
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 * @updated GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

export { VaccinesModule } from "./vaccines.module.js";
export { VaccinesService } from "./vaccines.service.js";
export { VaccinesController } from "./vaccines.controller.js";
export {
  VaccinesRepository,
  type VaccineProtocolPatch,
} from "./vaccines.repository.js";

export { VaccineApplicationsService } from "./vaccine-applications.service.js";
export { VaccineApplicationsController } from "./vaccine-applications.controller.js";
export {
  VaccineApplicationsRepository,
  type VaccineApplicationPatch,
} from "./vaccine-applications.repository.js";

export {
  VaccineStockLedger,
  type StockMovement,
  type StockMovementType,
} from "../../common/vaccines/vaccine-stock-ledger.js";
export {
  toVaccineApplication,
  isLotExpired,
  resolveApplicationDose,
  type VaccineApplicationRecord,
} from "../../common/vaccines/vaccine-application.types.js";
