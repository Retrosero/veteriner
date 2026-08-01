/**
 * @file ControlledDrugs modülü public API.
 * @module apps/api/modules/controlled-drugs
 * @since GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri core
 */

export { ControlledDrugsModule } from "./controlled-drugs.module.js";
export { ControlledDrugsController } from "./controlled-drugs.controller.js";
export { ControlledDrugsService } from "./controlled-drugs.service.js";
export { ControlledDrugsRepository } from "./controlled-drugs.repository.js";
export {
  toCdRegisterEntry,
  type CdRegisterRecord,
  type CdStockBalance,
  type CdReceiptCreate,
  type CdDispensingCreate,
  type CdWastageCreate,
  type CdReturnCreate,
  type CdTransferCreate,
  type CdStockCountCreate,
  type CdRegisterSearchFilters,
} from "../../common/controlled-drugs/controlled-drug.types.js";
