/**
 * @file Lab adapters modülü.
 * @module apps/api/modules/lab-adapters/lab-adapters.module
 *
 * @description GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter
 *   feature modülü. İki mock adapter provider olarak bağlanır.
 *   Gerçek provider entegrasyonu Faz 13+ kapsamında.
 *
 *   Cross-module bağımlılıklar:
 *   - `LabOrdersModule` — order varlık + durum kontrolü
 *   - `LabResultsModule` — import sırasında otomatik labResult
 *     oluşturma (mapping)
 *
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import { Module } from "@nestjs/common";

import { LabAdaptersController } from "./lab-adapters.controller.js";
import { LabAdaptersRepository } from "./lab-adapters.repository.js";
import { LabAdaptersService } from "./lab-adapters.service.js";
import {
  EXTERNAL_LAB_ADAPTER,
  LAB_DEVICE_ADAPTER,
} from "../../common/lab-adapters/lab-adapter.types.js";
import { MockExternalLabAdapter } from "../../common/lab-adapters/mock-external-lab-adapter.js";
import { MockLabDeviceAdapter } from "../../common/lab-adapters/mock-lab-device-adapter.js";
import { LabOrdersModule } from "../lab-orders/lab-orders.module.js";
import { LabResultsModule } from "../lab-results/lab-results.module.js";

@Module({
  imports: [LabOrdersModule, LabResultsModule],
  controllers: [LabAdaptersController],
  providers: [
    LabAdaptersService,
    LabAdaptersRepository,
    MockLabDeviceAdapter,
    MockExternalLabAdapter,
    { provide: LAB_DEVICE_ADAPTER, useExisting: MockLabDeviceAdapter },
    { provide: EXTERNAL_LAB_ADAPTER, useExisting: MockExternalLabAdapter },
  ],
  exports: [LabAdaptersService, LabAdaptersRepository],
})
export class LabAdaptersModule {}
