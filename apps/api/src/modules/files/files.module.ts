/**
 * @file Files modülü.
 * @module apps/api/modules/files/files.module
 *
 * @description Files feature modülü. Controller + service DI'a eklenir.
 * Storage ve antivirus driver'ları `STORAGE_DRIVER` / `ANTIVIRUS_DRIVER`
 * token'ları ile inject edilir; FAZ-0'da `LocalStorageDriver` ve
 * `ClamAvAntivirusDriver` (stub) bağlanır.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

import { Module } from "@nestjs/common";

import { ClamAvAntivirusDriver } from "../../common/files/clamav-antivirus.driver.js";
import { LocalStorageDriver } from "../../common/files/local-storage.driver.js";
import { ANTIVIRUS_DRIVER } from "../../common/files/antivirus.interface.js";
import { STORAGE_DRIVER } from "../../common/files/storage.interface.js";

import { FilesController } from "./files.controller.js";
import { FilesService } from "./files.service.js";

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    LocalStorageDriver,
    ClamAvAntivirusDriver,
    {
      provide: STORAGE_DRIVER,
      useExisting: LocalStorageDriver,
    },
    {
      provide: ANTIVIRUS_DRIVER,
      useExisting: ClamAvAntivirusDriver,
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
