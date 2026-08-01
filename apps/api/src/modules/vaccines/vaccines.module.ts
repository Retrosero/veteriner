/**
 * @file Vaccines modülü.
 * @module apps/api/modules/vaccines/vaccines.module
 *
 * @description GOAL-050 aşı kataloğu ve protokol yönetimi +
 * GOAL-051 aşı uygulama kaydı + GOAL-052 aşı kartı + GOAL-053
 * aşı hatırlatma feature modülü. Service + repository +
 * controller + stock ledger DI'a eklenir. AuditService
 * global modülden gelir.
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 * @updated GOAL-051 (FAZ-5) aşı uygulama kaydı core (patient
 *   doğrulaması için PatientsModule + stok ledger eklendi)
 * @updated GOAL-052 (FAZ-5) aşı kartı core (kart service +
 *   portal ayarı repository + personel/portal controller
 *   eklendi)
 * @updated GOAL-053 (FAZ-5) aşı hatırlatma core (reminder
 *   service + repository + controller + tenant config)
 */

import { Module } from "@nestjs/common";

import { VaccineApplicationsController } from "./vaccine-applications.controller.js";
import { VaccineApplicationsRepository } from "./vaccine-applications.repository.js";
import { VaccineApplicationsService } from "./vaccine-applications.service.js";
import {
  PortalVaccineCardsController,
  VaccineCardsController,
} from "./vaccine-cards.controller.js";
import { VaccineCardsRepository } from "./vaccine-cards.repository.js";
import { VaccineCardsService } from "./vaccine-cards.service.js";
import { VaccineRemindersController } from "./vaccine-reminders.controller.js";
import { VaccineRemindersRepository } from "./vaccine-reminders.repository.js";
import { VaccineRemindersService } from "./vaccine-reminders.service.js";
import { VaccinesController } from "./vaccines.controller.js";
import { VaccinesRepository } from "./vaccines.repository.js";
import { VaccinesService } from "./vaccines.service.js";
import { AuditModule } from "../../common/audit/audit.module.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import { VaccineStockLedger } from "../../common/vaccines/vaccine-stock-ledger.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OwnersModule } from "../owners/owners.module.js";
import { PatientsModule } from "../patients/patients.module.js";
import { PortalAuthModule } from "../portal-auth/portal-auth.module.js";
import { TenantModule } from "../tenant/tenant.module.js";

@Module({
  imports: [
    AuditModule,
    NotificationsModule,
    PatientsModule,
    OwnersModule,
    TenantModule,
    PortalAuthModule,
  ],
  controllers: [
    VaccinesController,
    VaccineApplicationsController,
    VaccineCardsController,
    PortalVaccineCardsController,
    VaccineRemindersController,
  ],
  providers: [
    VaccinesService,
    VaccinesRepository,
    VaccineApplicationsService,
    VaccineApplicationsRepository,
    VaccineStockLedger,
    VaccineCardsService,
    VaccineCardsRepository,
    VaccineRemindersService,
    VaccineRemindersRepository,
    ConsentService,
  ],
  exports: [
    VaccinesService,
    VaccinesRepository,
    VaccineApplicationsService,
    VaccineApplicationsRepository,
    VaccineStockLedger,
    VaccineCardsService,
    VaccineCardsRepository,
    VaccineRemindersService,
    VaccineRemindersRepository,
  ],
})
export class VaccinesModule {}
