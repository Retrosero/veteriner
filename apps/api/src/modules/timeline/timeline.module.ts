/**
 * @file Timeline modülü.
 * @module apps/api/modules/timeline/timeline.module
 *
 * @description GOAL-024 hayvan zaman çizelgesi feature modülü.
 * Service + controller DI'a eklenir. Patient tenant doğrulaması
 * için PatientsModule'den gelen PatientsRepository kullanılır.
 * Event source'lar (AlertTimelineSource, OwnershipTimelineSource,
 * FileTimelineSource) ilgili modüllerden inject edilir ve DI
 * token'ı üzerinden service'e sağlanır.
 *
 * @since GOAL-024 (FAZ-2) hayvan zaman çizelgesi core
 */

import { Module } from "@nestjs/common";

import { TimelineController } from "./timeline.controller.js";
import { TimelineService } from "./timeline.service.js";
import {
  AlertTimelineSource,
  FileTimelineSource,
  OwnershipTimelineSource,
  TIMELINE_EVENT_SOURCES,
} from "./timeline.sources.js";
import { AlertsModule } from "../alerts/alerts.module.js";
import { FileModule } from "../file/file.module.js";
import { OwnershipHistoryModule } from "../ownership-history/ownership-history.module.js";
import { PatientsModule } from "../patients/patients.module.js";

@Module({
  imports: [PatientsModule, AlertsModule, OwnershipHistoryModule, FileModule],
  controllers: [TimelineController],
  providers: [
    TimelineService,
    AlertTimelineSource,
    OwnershipTimelineSource,
    FileTimelineSource,
    {
      provide: TIMELINE_EVENT_SOURCES,
      useFactory: (
        alert: AlertTimelineSource,
        ownership: OwnershipTimelineSource,
        file: FileTimelineSource,
      ) => [alert, ownership, file] as const,
      inject: [
        AlertTimelineSource,
        OwnershipTimelineSource,
        FileTimelineSource,
      ],
    },
  ],
  exports: [TimelineService],
})
export class TimelineModule {}
