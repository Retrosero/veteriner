/**
 * @file File modülü.
 * @module apps/api/modules/file/file.module
 *
 * @description Dosya ve medya servisi feature modülü. Storage ve scan
 * adapter'ları DI provider olarak kayıt edilir; `STORAGE_DRIVER` ve
 * `SCAN_DRIVER` env değişkenleri ile seçim yapılır.
 *
 * Adapter seçimi:
 * - `STORAGE_DRIVER=local` (default): `LocalStorageAdapter`.
 * - `STORAGE_DRIVER=s3`: `S3StorageAdapter` (skeleton; SDK entegrasyonu
 *   sonraki tick).
 * - `SCAN_DRIVER=noop` (default): `NoopScanAdapter`.
 * - `SCAN_DRIVER=clamav`: `ClamAvScanAdapter` (skeleton; gerçek
 *   implementasyon sonraki tick).
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { Module, type Provider } from "@nestjs/common";

import { AuditModule } from "../../common/audit/audit.module.js";
import { LocalStorageAdapter } from "../../common/adapters/local-storage.adapter.js";
import { S3StorageAdapter } from "../../common/adapters/s3-storage.adapter.js";
import type { ScanAdapter } from "../../common/adapters/scan.adapter.js";
import type { StorageAdapter } from "../../common/adapters/storage.adapter.js";
import { NoopScanAdapter } from "../../common/adapters/noop-scan.adapter.js";
import { ClamAvScanAdapter } from "../../common/adapters/clamav-scan.adapter.js";

import { FileController } from "./file.controller.js";
import { FileRepository } from "./file.repository.js";
import { FileService } from "./file.service.js";

/**
 * Storage adapter provider. Env değişkenine göre seçim yapar.
 */
export const STORAGE_ADAPTER = Symbol("STORAGE_ADAPTER");
export const SCAN_ADAPTER = Symbol("SCAN_ADAPTER");

const storageProvider: Provider = {
  provide: STORAGE_ADAPTER,
  useFactory: (): StorageAdapter => {
    const driver = (process.env["STORAGE_DRIVER"] ?? "local").toLowerCase();
    if (driver === "s3") {
      return new S3StorageAdapter({
        bucket: process.env["S3_BUCKET"] ?? "",
        region: process.env["S3_REGION"] ?? "eu-central-1",
        ...(process.env["S3_ENDPOINT"] !== undefined
          ? { endpoint: process.env["S3_ENDPOINT"] }
          : {}),
        ...(process.env["S3_ACCESS_KEY_ID"] !== undefined
          ? { accessKeyId: process.env["S3_ACCESS_KEY_ID"] }
          : {}),
        ...(process.env["S3_SECRET_ACCESS_KEY"] !== undefined
          ? { secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"] }
          : {}),
      });
    }
    return new LocalStorageAdapter({
      rootDir: process.env["STORAGE_LOCAL_ROOT"] ?? "./storage",
      ...(process.env["STORAGE_SIGNING_KEY"] !== undefined
        ? { signingKey: process.env["STORAGE_SIGNING_KEY"] }
        : {}),
      ...(process.env["STORAGE_PUBLIC_BASE_URL"] !== undefined
        ? { publicBaseUrl: process.env["STORAGE_PUBLIC_BASE_URL"] }
        : {}),
    });
  },
};

/**
 * Scan adapter provider. Env değişkenine göre seçim yapar.
 */
const scanProvider: Provider = {
  provide: SCAN_ADAPTER,
  useFactory: (): ScanAdapter => {
    const driver = (process.env["SCAN_DRIVER"] ?? "noop").toLowerCase();
    if (driver === "clamav") {
      return new ClamAvScanAdapter({
        ...(process.env["CLAMAV_SOCKET"] !== undefined
          ? { socketPath: process.env["CLAMAV_SOCKET"] }
          : {}),
        ...(process.env["CLAMAV_HOST"] !== undefined
          ? { host: process.env["CLAMAV_HOST"] }
          : {}),
        ...(process.env["CLAMAV_PORT"] !== undefined
          ? { port: Number(process.env["CLAMAV_PORT"]) }
          : {}),
      });
    }
    return new NoopScanAdapter();
  },
};

@Module({
  imports: [AuditModule],
  controllers: [FileController],
  providers: [
    FileService,
    FileRepository,
    storageProvider,
    scanProvider,
  ],
  exports: [FileService, FileRepository, STORAGE_ADAPTER, SCAN_ADAPTER],
})
export class FileModule {}
