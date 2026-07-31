/**
 * @file Storage adapter interface.
 * @module apps/api/common/adapters/storage
 *
 * @description Dosya servisi için S3-uyumlu storage backend sözleşmesi.
 * Tüm implementasyonlar (local, S3, Azure Blob) bu interface'i uygular;
 * FileService adapter'a doğrudan bağlanmaz, Registry üzerinden çözümler.
 *
 * @security
 * - `put` sırasında storage backend tarafında tenant-bazlı path üretilir;
 *   path injection engellenir.
 * - `getSignedUrl` kısa ömürlüdür (default 5 dk); TTL parametreyle
 *   sınırlandırılabilir.
 * - `delete` aslında soft delete (storage tarafında arşiv bucket'ına
 *   taşınır); fiziksel silme retention job'ı tarafından yapılır
 *   (GOAL-014 sonrası).
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import type { Readable } from "node:stream";

/**
 * Bir storage nesnesinin meta verileri. Adapter'dan bağımsız,
 * FileService bu tipi tüketir.
 */
export interface StorageObject {
  /**
   * Backend'deki path/key (örn. `tenants/<uuid>/files/<uuid>`).
   * FileMeta.storageKey ile birebir eşleşir.
   */
  readonly key: string;
  /**
   * İçerik byte cinsinden boyut.
   */
  readonly size: number;
  /**
   * MIME tipi (adapter tarafından doğrulanır; servis katmanı whitelist
   * ile ek kontrol yapar).
   */
  readonly contentType: string;
  /**
   * Son güncelleme zamanı (metadata).
   */
  readonly lastModified: Date;
  /**
   * Hex SHA-256 (storage backend hesaplayabilir; aksi halde servis
   * katmanı hesaplar).
   */
  readonly checksumSha256: string;
}

/**
 * Yükleme parametreleri. `key` zorunlu; tenant-bazlı path şeması
 * servis katmanında üretilir.
 */
export interface StoragePutInput {
  readonly key: string;
  readonly body: Buffer | Readable;
  readonly contentType: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Signed URL oluşturma seçenekleri.
 */
export interface SignedUrlOptions {
  /**
   * URL ömrü (saniye). Default 300 (5 dakika); max 3600.
   */
  readonly expiresInSeconds?: number;
  /**
   * Response Content-Disposition header (örn. `attachment; filename="x.pdf"`).
   */
  readonly contentDisposition?: string;
}

/**
 * Storage adapter sözleşmesi.
 *
 * @example
 * ```ts
 * class LocalStorageAdapter implements StorageAdapter { ... }
 * class S3StorageAdapter implements StorageAdapter { ... }
 * ```
 */
export interface StorageAdapter {
  /**
   * Adapter'ın adı (log + metric için). Örn. `local`, `s3`.
   */
  readonly name: string;

  /**
   * Storage'a nesne yazar (upload). Varsa aynı key üzerine yazar
   * (idempotent); tenant-bazlı key çakışması backend'te UNIQUE
   * constraint ile engellenir.
   */
  put(input: StoragePutInput): Promise<StorageObject>;

  /**
   * Key ile storage'dan nesneyi getirir. Bulunamazsa null.
   */
  get(key: string): Promise<StorageObject | null>;

  /**
   * Storage'dan okunabilir stream döner. Download akışı için.
   */
  getStream(key: string): Promise<Readable | null>;

  /**
   * Kısa ömürlü signed URL üretir (tarayıcıdan doğrudan erişim için).
   * `expiresInSeconds` 60-3600 aralığında olmalı.
   */
  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string>;

  /**
   * Nesneyi "arşivler" (soft delete). Implementasyona göre:
   * - local: dosyayı `archived/` altına taşır.
   * - S3: Glacier tier'a geçirir veya `archive/` prefix'ine kopyalar.
   *
   * Fiziksel silme bu metottan ASLA yapılmaz. Retention job ayrıca
   * çalışır.
   */
  archive(key: string, reason: string): Promise<void>;

  /**
   * Storage sağlık kontrolü. Test/health endpoint'inden çağrılır.
   * Bucket erişim hatası, network hatası vb. durumlarda false.
   */
  healthCheck(): Promise<boolean>;
}
