/**
 * @file EsmmDocuments modülü.
 * @module apps/api/modules/esmm/esmm.module
 *
 * @description GOAL-077 (FAZ-7) e-SMM adapter feature modülü.
 * MVP'de MockEsmmAdapter provider olarak bağlanır. Gerçek
 * provider entegrasyonu Faz 13+ kapsamında.
 *
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import { Module } from "@nestjs/common";

import { EsmmDocumentsController } from "./esmm.controller.js";
import { EsmmDocumentsRepository } from "./esmm.repository.js";
import { EsmmDocumentsService } from "./esmm.service.js";
import { ESMM_ADAPTER } from "../../common/esmm/esmm.types.js";
import { MockEsmmAdapter } from "../../common/esmm/mock-esmm-adapter.js";

@Module({
  controllers: [EsmmDocumentsController],
  providers: [
    EsmmDocumentsService,
    EsmmDocumentsRepository,
    MockEsmmAdapter,
    { provide: ESMM_ADAPTER, useExisting: MockEsmmAdapter },
  ],
  exports: [EsmmDocumentsService, EsmmDocumentsRepository],
})
export class EsmmModule {}
