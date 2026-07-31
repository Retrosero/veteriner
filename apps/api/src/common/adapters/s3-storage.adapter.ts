/**
 * @file S3 uyumlu storage adapter (skeleton).
 * @module apps/api/common/adapters/s3-storage
 *
 * @description AWS S3 (ve S3-uyumlu: MinIO, Cloudflare R2, Wasabi)
 * adaptörü için iskelet implementasyon. Gerçek SDK entegrasyonu
 * `@aws-sdk/client-s3` ve `@aws-sdk/s3-request-presigner` paketleri
 * ile yapılır; bu adapter sözleşmeyi uygular.
 *
 * Çalışma modu:
 * - Production'da `STORAGE_DRIVER=s3` env ile devreye alınır.
 * - `getSignedUrl` S3 native presigned URL üretir (TTL 60-3600 sn).
 * - `archive` Glacier tier'a geçiş + `archive/` prefix'ine kopya.
 *
 * @security
 * - Bucket policy: public access kapalı.
 * - Presigned URL TTL kısa (default 300 sn).
 * - Server-side encryption (SSE-S3 veya SSE-KMS) zorunlu.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

import type {
  SignedUrlOptions,
  StorageAdapter,
  StorageObject,
  StoragePutInput,
} from "./storage.adapter.js";

/**
 * S3 adapter konfigürasyonu.
 */
export interface S3StorageConfig {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  /**
   * Server-side encryption. Default `AES256`. KMS için `aws:kms`.
   */
  readonly serverSideEncryption?: "AES256" | "aws:kms";
  /**
   * Klasör tier'a taşıma (Glacier) için gün sayısı. Default 30.
   */
  readonly archiveAfterDays?: number;
}

/**
 * S3 uyumlu storage adapter. Bu sınıf skeleton; SDK entegrasyonu
 * sonraki tick'lerde eklenecek. Şu an `healthCheck` ve metadata
 * üretimi çalışır; put/get sırasında NotImplementedError fırlatır.
 *
 * Test ortamında `LocalStorageAdapter` kullanılır.
 */
export class S3StorageAdapter implements StorageAdapter {
  public readonly name = "s3";

  private readonly config: Required<
    Pick<S3StorageConfig, "bucket" | "region" | "serverSideEncryption" | "archiveAfterDays">
  > &
    S3StorageConfig;

  public constructor(config: S3StorageConfig) {
    if (!config.bucket) {
      throw new Error("s3_storage: bucket zorunlu");
    }
    if (!config.region) {
      throw new Error("s3_storage: region zorunlu");
    }
    this.config = {
      ...config,
      serverSideEncryption: config.serverSideEncryption ?? "AES256",
      archiveAfterDays: config.archiveAfterDays ?? 30,
    };
  }

  public async put(_input: StoragePutInput): Promise<StorageObject> {
    // TODO(GOAL-014+): @aws-sdk/client-s3 PutObjectCommand.
    // SSE, content-type, metadata header'ları set edilmeli.
    throw new Error("S3StorageAdapter.put henüz implemente edilmedi");
  }

  public async get(_key: string): Promise<StorageObject | null> {
    // TODO(GOAL-014+): HeadObjectCommand + checksum.
    throw new Error("S3StorageAdapter.get henüz implemente edilmedi");
  }

  public async getStream(_key: string): Promise<Readable | null> {
    // TODO(GOAL-014+): GetObjectCommand.
    throw new Error("S3StorageAdapter.getStream henüz implemente edilmedi");
  }

  public async getSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    // TODO(GOAL-014+): getSignedUrl(s3, command, { expiresIn }).
    // expiresIn 60-3600 clamp.
    void key;
    void options;
    throw new Error("S3StorageAdapter.getSignedUrl henüz implemente edilmedi");
  }

  public async archive(key: string, reason: string): Promise<void> {
    // TODO(GOAL-014+): copy + delete + Glacier tier.
    void key;
    void reason;
    throw new Error("S3StorageAdapter.archive henüz implemente edilmedi");
  }

  public async healthCheck(): Promise<boolean> {
    // TODO(GOAL-014+): HeadBucket. Şimdilik config doğrulaması yeterli.
    return Boolean(this.config.bucket && this.config.region);
  }

  /**
   * Storage'da tutulacak anahtar şeması. S3 prefix'leri için kullanılır.
   */
  public buildKey(tenantId: string, fileId: string, suffix?: string): string {
    const base = `tenants/${tenantId}/files/${fileId}`;
    return suffix ? `${base}/${suffix}` : base;
  }

  /**
   * Checksum doğrulaması için local helper (test amaçlı).
   */
  public hashBody(body: Buffer | Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      if (Buffer.isBuffer(body)) {
        hash.update(body);
        resolve(hash.digest("hex"));
        return;
      }
      body.on("data", (chunk: Buffer | string) => {
        hash.update(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });
      body.on("end", () => resolve(hash.digest("hex")));
      body.on("error", reject);
    });
  }
}
