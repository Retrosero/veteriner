/**
 * @file SOAP modülü.
 * @module apps/api/modules/soap/soap.module
 *
 * @description GOAL-041 SOAP klinik kaydı feature modülü. Service +
 * repository + controller DI'a eklenir. ExaminationsService (GOAL-040)
 * SOAP imzalama sırasında muayeneyi imzalamak için kullanılır
 * (cross-service delegation). AuditService global modülden gelir.
 *
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
 */

import { Module } from "@nestjs/common";

import { SoapController } from "./soap.controller.js";
import {
  SoapAmendsRepository,
  SoapNotesRepository,
} from "./soap.repository.js";
import { SoapService } from "./soap.service.js";
import { ExaminationsModule } from "../examinations/examinations.module.js";

@Module({
  imports: [ExaminationsModule],
  controllers: [SoapController],
  providers: [SoapService, SoapNotesRepository, SoapAmendsRepository],
  exports: [SoapService, SoapNotesRepository],
})
export class SoapModule {}
