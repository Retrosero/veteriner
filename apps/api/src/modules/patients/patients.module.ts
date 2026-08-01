/**
 * @file Patients modülü.
 * @module apps/api/modules/patients/patients.module
 *
 * @description Patient feature modülü. Service + repository +
 * controller DI'a eklenir. Owner doğrulaması için OwnersModule'den
 * gelen OwnersService kullanılır. AuditService global modülden
 * gelir.
 *
 * GOAL-022 ile birlikte hasta oluşturma sırasında ilk sahiplik
 * kaydı (`reason=initial`) `OwnershipHistoryService` üzerinden
 * otomatik açılır. Döngüsel bağımlılık `forwardRef` ile çözülür.
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 * @updated GOAL-022 (FAZ-2) ilk sahiplik kaydı entegrasyonu
 */

import { Module, forwardRef } from "@nestjs/common";

import { PatientsController } from "./patients.controller.js";
import { PatientsRepository } from "./patients.repository.js";
import { PatientsService } from "./patients.service.js";
import { AlertsModule } from "../alerts/alerts.module.js";
import { OwnersModule } from "../owners/owners.module.js";
import { OwnershipHistoryModule } from "../ownership-history/ownership-history.module.js";

@Module({
  imports: [
    OwnersModule,
    forwardRef(() => OwnershipHistoryModule),
    forwardRef(() => AlertsModule),
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsRepository],
  exports: [PatientsService, PatientsRepository],
})
export class PatientsModule {}
