/**
 * @file S3 uyumlu storage adapter.
 * @module apps/api/common/adapters/s3-storage
 * @description AWS S3 ve S3-uyumlu sağlayıcılara (MinIO, Cloudflare R2,
 * Wasabi) dosya yazar, okur, imzalı URL üretir ve nesneleri arşiv prefix'ine
 * taşır. FileService bu adapter üzerinden tenant-scoped anahtar kullanır.
 * @security Bucket public olmamalıdır. Tüm yeni nesneler SSE-S3 veya SSE-KMS
 * ile şifrelenir; presigned URL süresi 60-3600 saniye ile sınırlıdır.
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { createHash } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  SignedUrlOptions,
  StorageAdapter,
  StorageObject,
  StoragePutInput,
} from "./storage.adapter.js";
import type { Readable } from "node:stream";

/** S3 adapter yapılandırması. */
export interface S3StorageConfig {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  /** MinIO/R2 gibi sağlayıcılarda path-style adresleme gerektiğinde açılır. */
  readonly forcePathStyle?: boolean;
  /** Server-side encryption. Default `AES256`; KMS için `aws:kms`. */
  readonly serverSideEncryption?: "AES256" | "aws:kms";
  /** Gelecek lifecycle kuralı için arşiv yaşı. Default 30 gün. */
  readonly archiveAfterDays?: number;
}

/** S3 uyumlu üretim storage implementasyonu. */
export class S3StorageAdapter implements StorageAdapter {
  public readonly name = "s3";

  private readonly config: Readonly<
    Required<
      Pick<
        S3StorageConfig,
        "bucket" | "region" | "serverSideEncryption" | "archiveAfterDays"
      >
    > &
      S3StorageConfig
  >;

  private readonly client: S3Client;

  public constructor(config: S3StorageConfig) {
    if (!config.bucket) throw new Error("s3_storage: bucket zorunlu");
    if (!config.region) throw new Error("s3_storage: region zorunlu");

    this.config = {
      ...config,
      serverSideEncryption: config.serverSideEncryption ?? "AES256",
      archiveAfterDays: config.archiveAfterDays ?? 30,
    };
    this.client = new S3Client({
      region: this.config.region,
      ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
      ...(this.config.forcePathStyle !== undefined
        ? { forcePathStyle: this.config.forcePathStyle }
        : {}),
      ...(this.config.accessKeyId && this.config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: this.config.accessKeyId,
              secretAccessKey: this.config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  public async put(input: StoragePutInput): Promise<StorageObject> {
    // FileService halihazırda tarama için içeriği belleğe alır. Burada da
    // checksum ile S3 body'nin aynı byte dizisi olması için tek Buffer kullanılır.
    const body = await this.toBuffer(input.body);
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
        ContentLength: body.byteLength,
        Metadata: input.metadata,
        ServerSideEncryption: this.config.serverSideEncryption,
        ChecksumSHA256: Buffer.from(checksumSha256, "hex").toString("base64"),
      }),
    );
    return {
      key: input.key,
      size: body.byteLength,
      contentType: input.contentType,
      lastModified: new Date(),
      checksumSha256,
    };
  }

  public async get(key: string): Promise<StorageObject | null> {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return {
        key,
        size: object.ContentLength ?? 0,
        contentType: object.ContentType ?? "application/octet-stream",
        lastModified: object.LastModified ?? new Date(0),
        // S3 checksum'u Base64 döndürür; StorageAdapter sözleşmesi hex'tir.
        checksumSha256: object.ChecksumSHA256
          ? Buffer.from(object.ChecksumSHA256, "base64").toString("hex")
          : "",
      };
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  public async getStream(key: string): Promise<Readable | null> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return object.Body ? (object.Body as Readable) : null;
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  public async getSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    const expiresIn = Math.max(
      60,
      Math.min(3600, options.expiresInSeconds ?? 300),
    );
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ...(options.contentDisposition
          ? { ResponseContentDisposition: options.contentDisposition }
          : {}),
      }),
      { expiresIn },
    );
  }

  public async archive(key: string, reason: string): Promise<void> {
    const archivedKey = `archived/${key}`;
    // S3'te rename yoktur. Kopyala + kaynağı sil ile fiziksel olarak yok
    // etmek yerine aynı bucket'ta arşiv nesnesine taşırız; retention purge
    // süreci ayrıca ve denetlenebilir şekilde çalışır.
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: archivedKey,
        CopySource: `/${this.config.bucket}/${this.copySourceKey(key)}`,
        MetadataDirective: "COPY",
      }),
    );
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    void reason;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Storage'da tutulacak tenant-safe anahtar şeması. */
  public buildKey(tenantId: string, fileId: string, suffix?: string): string {
    const base = `tenants/${tenantId}/files/${fileId}`;
    return suffix ? `${base}/${suffix}` : base;
  }

  /** Checksum doğrulama helper'ı. */
  public async hashBody(body: Buffer | Readable): Promise<string> {
    return createHash("sha256")
      .update(await this.toBuffer(body))
      .digest("hex");
  }

  /** S3 CopySource için anahtarın her segmentini URI-encode eder. */
  private copySourceKey(key: string): string {
    return key.split("/").map(encodeURIComponent).join("/");
  }

  /** Buffer/stream gövdesini güvenli biçimde tekrar kullanılabilir Buffer'a alır. */
  private async toBuffer(body: Buffer | Readable): Promise<Buffer> {
    if (Buffer.isBuffer(body)) return body;
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (typeof chunk === "string" || chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
        continue;
      }
      throw new Error("s3_storage: stream parçası binary değil");
    }
    return Buffer.concat(chunks);
  }

  private isNotFound(error: unknown): boolean {
    return (
      error instanceof S3ServiceException &&
      (error.$metadata.httpStatusCode === 404 || error.name === "NotFound")
    );
  }
}
