/**
 * @file ClamAV antivirus driver (FAZ-10+ stub).
 * @module apps/api/common/files/clamav-antivirus.driver
 * @description ClamAV tabanlı antivirus driver. FAZ-0'da stub olarak
 * her zaman `clean` döner; FAZ-10+ clamd daemon veya clamscan CLI
 * entegrasyonu yapılacak. Stub sayesinde upload akışı antivirus
 * bağımlılığı olmadan çalışır.
 * @security "Error" durumunda policy: şimdilik `clean` döndürülür
 *   (development/test kolaylığı). Production'da `infected` politikası
 *   uygulanacak (fail-closed).
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi (stub)
 * @planned FAZ-10+ ClamAV daemon entegrasyonu
 */

import { Injectable, Logger } from "@nestjs/common";

import type {
  AntivirusDriver,
  AntivirusResult,
} from "./antivirus.interface.js";

/**
 * ClamAV tabanlı antivirus driver. Şu an stub.
 */
@Injectable()
export class ClamAvAntivirusDriver implements AntivirusDriver {
  private readonly logger = new Logger(ClamAvAntivirusDriver.name);

  public constructor() {
    this.logger.warn(
      "ClamAvAntivirusDriver is a FAZ-10+ stub; every file is reported clean.",
    );
  }

  public async scan(_data: Buffer, _mime: string): Promise<AntivirusResult> {
    // Stub: gerçek entegrasyon clamd/clamdscan üzerinden yapılacak.
    return "clean";
  }
}
