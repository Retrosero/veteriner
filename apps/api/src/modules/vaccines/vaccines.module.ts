/**
 * @file Vaccines modülü.
 * @module apps/api/modules/vaccines/vaccines.module
 *
 * @description GOAL-050 aşı kataloğu ve protokol yönetimi + GOAL-051
 * aşı uygulama kaydı + GOAL-052 aşı kartı feature modülü.
 * Service + repository + controller + stock ledger DI'a
 * eklenir. AuditService global modülden gelir.
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 * @updated GOAL-051 (FAZ-5) aşı uygulama kaydı core (patient
 *   doğrulaması için PatientsModule + stok ledger eklendi)
 * @updated GOAL-052 (FAZ-5) aşı kartı core (kart service +
 *   portal ayarı repository + personel/portal controller
 *   eklendi)
 */

import { Module } from "@nestjs/common";

import { PatientsModule } from "../patients/patients.module.js";
import { PortalAuthModule } from "../portal-auth/portal-auth.module.js";

import {
  PortalVaccineCardsController,
  VaccineCardsController,
} from "./vaccine-cards.controller.js";
import { VaccineCardsRepository } from "./vaccine-cards.repository.js";
import { VaccineCardsService } from "./vaccine-cards.service.js";
import { VaccineApplicationsController } from "./vaccine-applications.controller.js";
import { VaccineApplicationsService } from "./vaccine-applications.service.js";
import { VaccineApplicationsRepository } from "./vaccine-applications.repository.js";
import { VaccineStockLedger } from "../../common/vaccines/vaccine-stock-ledger.js";
import { VaccinesController } from "./vaccines.controller.js";
import { VaccinesService } from "./vaccines.service.js";
import { VaccinesRepository } from "./vaccines.repository.js";

@Module({
  imports: [PatientsModule, PortalAuthModule],
  controllers: [
    VaccinesController,
    VaccineApplicationsController,
    VaccineCardsController,
    PortalVaccineCardsController,
  ],
  providers: [
    VaccinesService,
    VaccinesRepository,
    VaccineApplicationsService,
    VaccineApplicationsRepository,
    VaccineStockLedger,
    VaccineCardsService,
    VaccineCardsRepository,
  ],
  exports: [
    VaccinesService,
    VaccinesRepository,
    VaccineApplicationsService,
    VaccineApplicationsRepository,
    VaccineStockLedger,
    VaccineCardsService,
    VaccineCardsRepository,
  ],
})
export class VaccinesModule {}
