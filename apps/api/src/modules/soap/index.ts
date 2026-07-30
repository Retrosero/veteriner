/**
 * @file SOAP modülü public API.
 * @module apps/api/modules/soap
 *
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
 */

export { SoapModule } from "./soap.module.js";
export { SoapService } from "./soap.service.js";
export { SoapController } from "./soap.controller.js";
export {
  SoapNotesRepository,
  SoapAmendsRepository,
  type SoapNoteRecord,
  type SoapAmendRecord,
} from "./soap.repository.js";
