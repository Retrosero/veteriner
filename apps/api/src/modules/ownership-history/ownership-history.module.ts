/**
 * @file Ownership history modülü.
 * @module apps/api/modules/ownership-history/ownership-history.module
 *
 * @description GOAL-022 hayvan sahiplik geçmişi feature modülü.
 * Service + repository + controller DI'a eklenir. Owner doğrulaması
 * için OwnersModule'den, hasta erişimi için PatientsModule'den
 * gelen servisler kullanılır. AuditService global modülden gelir.
 *
 * `forwardRef` kullanımı: `PatientsModule` hasta oluşturma
 * sırasında ilk sahiplik kaydını bu modülden alır; bu nedenle iki
 * yönlü referans `forwardRef` ile çözülür.
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

import { Module, forwardRef } from "@nestjs/common";

import { OwnershipHistoryController } from "./ownership-history.controller.js";
import { OwnershipHistoryRepository } from "./ownership-history.repository.js";
import { OwnershipHistoryService } from "./ownership-history.service.js";
import { OwnersModule } from "../owners/owners.module.js";
import { PatientsModule } from "../patients/patients.module.js";

@Module({
  imports: [OwnersModule, forwardRef(() => PatientsModule)],
  controllers: [OwnershipHistoryController],
  providers: [OwnershipHistoryService, OwnershipHistoryRepository],
  exports: [OwnershipHistoryService, OwnershipHistoryRepository],
})
export class OwnershipHistoryModule {}
