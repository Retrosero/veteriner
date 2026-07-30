/**
 * @file Clinical records modülü.
 * @module apps/api/modules/clinical-records/clinical-records.module
 *
 * @description GOAL-047 klinik kayıt PDF ve paylaşım feature modülü.
 * Service + repository + controller DI'a eklenir. PDF üretimi için
 * muayene + SOAP + Vitals + Diagnoses + Prescriptions + Orders +
 * Followups modülleri kullanılır; paylaşım için File ve Notifications
 * modülleri entegre edilir. AuditService global modülden gelir.
 *
 * @since GOAL-047 (FAZ-4) klinik kayıt PDF ve paylaşım core
 */

import { Module } from "@nestjs/common";

import { DiagnosesModule } from "../diagnoses/diagnoses.module.js";
import { ExaminationsModule } from "../examinations/examinations.module.js";
import { FileModule } from "../file/file.module.js";
import { FollowupsModule } from "../followups/followups.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { PrescriptionsModule } from "../prescriptions/prescriptions.module.js";
import { SoapModule } from "../soap/soap.module.js";
import { VitalsModule } from "../vitals/vitals.module.js";

import { ClinicalRecordsController } from "./clinical-records.controller.js";
import { ClinicalRecordSharesRepository } from "./clinical-records.repository.js";
import { ClinicalRecordsService } from "./clinical-records.service.js";

@Module({
  imports: [
    ExaminationsModule,
    SoapModule,
    VitalsModule,
    DiagnosesModule,
    PrescriptionsModule,
    OrdersModule,
    FollowupsModule,
    FileModule,
    NotificationsModule,
  ],
  controllers: [ClinicalRecordsController],
  providers: [ClinicalRecordsService, ClinicalRecordSharesRepository],
  exports: [ClinicalRecordsService, ClinicalRecordSharesRepository],
})
export class ClinicalRecordsModule {}
