/**
 * @file Storage driver sözleşmesi.
 * @module apps/api/common/files/storage.interface
 *
 * @description Dosya saklama backend'leri için soyutlama. FAZ-0'da
 * `LocalStorageDriver`, FAZ-14+ için `S3StorageDriver` aynı interface'i
 * uygular. Driver seçimi konfigürasyon üzerinden yapılır; service
 * katmanı driver'dan habersizdir.
 *
 * @security `path` alanı her driver tarafından validate edilir
 *   (path traversal engellenir). Driver'lar `Buffer` ve `mime`
 *   parametrelerini doğrudan kabul eder; ek bir layer
 *   eklenmezse "no extra security boundary" prensibi korunur.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

/**
 * Storage driver interface. Tüm implementasyonlar (local, S3, GCS,
 * Azure Blob) aynı sözleşmeyi uygular.
 */
export interface StorageDriver {
  /**
   * Verilen path'e binary içeriği yazar. Path'in driver tarafından
   * normalize edildiği varsayılır; service katmanı path üretir.
   */
  put(path: string, data: Buffer, mime: string): Promise<void>;

  /**
   * Path'ten binary içeriği okur. Bulunamazsa hata fırlatır.
   */
  get(path: string): Promise<Buffer>;

  /**
   * Path'teki dosyayı siler. Bulunamazsa no-op.
   */
  delete(path: string): Promise<void>;

  /**
   * Geçici erişim URL'i üretir. Local driver dosya içeriğini
   * imzalı bir proxy endpoint üzerinden sunar; S3 driver presigned
   * URL üretir. `expiresInSec` 0'dan büyük olmalı.
   */
  signedUrl(path: string, expiresInSec: number): Promise<string>;
}

/**
 * Storage driver token. NestJS DI'da interface'i inject etmek için
 * kullanılır (`@Inject(STORAGE_DRIVER)`).
 */
export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");
