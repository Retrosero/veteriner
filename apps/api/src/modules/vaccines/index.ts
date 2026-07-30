/**
 * @file Vaccines modülü public API.
 * @module apps/api/modules/vaccines
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

export { VaccinesModule } from "./vaccines.module.js";
export { VaccinesService } from "./vaccines.service.js";
export { VaccinesController } from "./vaccines.controller.js";
export {
  VaccinesRepository,
  type VaccineProtocolPatch,
} from "./vaccines.repository.js";
