/**
 * @file S3 storage driver (FAZ-14+ stub).
 * @module apps/api/common/files/s3-storage.driver
 *
 * @description S3-uyumlu object storage driver interface stub'ı. FAZ-14+
 * ile gerçek implementasyon yapılacak (AWS SDK v3 / MinIO). Stub
 * çağrıldığında `NotImplementedError` fırlatır; production deploy'lar
 * için `LocalStorageDriver` veya tamamlanmış `S3StorageDriver`
 * kullanılmalı.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi (stub)
 * @planned FAZ-14+ gerçek implementasyon
 */

import { Injectable, Logger } from "@nestjs/common";

import type { StorageDriver } from "./storage.interface.js";

/**
 * S3-uyumlu storage driver. Şu an stub; gerçek implementasyon
 * FAZ-14+ ile yapılacak. DI container'a `STORAGE_DRIVER` token'ı
 * ile bağlanır; konfigürasyona göre `LocalStorageDriver` ile
 * değiştirilir.
 */
@Injectable()
export class S3StorageDriver implements StorageDriver {
  private readonly logger = new Logger(S3StorageDriver.name);

  public constructor() {
    this.logger.warn(
      "S3StorageDriver is a FAZ-14+ stub; using it now will throw NotImplementedError.",
    );
  }

  public async put(_path: string, _data: Buffer, _mime: string): Promise<void> {
    throw new Error("S3StorageDriver.put not implemented (FAZ-14+)");
  }

  public async get(_path: string): Promise<Buffer> {
    throw new Error("S3StorageDriver.get not implemented (FAZ-14+)");
  }

  public async delete(_path: string): Promise<void> {
    throw new Error("S3StorageDriver.delete not implemented (FAZ-14+)");
  }

  public async signedUrl(_path: string, _expiresInSec: number): Promise<string> {
    throw new Error("S3StorageDriver.signedUrl not implemented (FAZ-14+)");
  }
}
