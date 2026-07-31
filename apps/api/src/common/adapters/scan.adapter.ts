/**
 * @file Scan adapter interface — zararlı içerik taraması.
 * @module apps/api/common/adapters/scan
 *
 * @description Yüklenen dosyaların zararlı içerik (malware) taraması
 * için adapter sözleşmesi. Tüm implementasyonlar (noop, ClamAV,
 * VirusTotal) bu interface'i uygular.
 *
 * Akış:
 * 1. `FileService.upload` storage'a yazar + FileMeta oluşturur.
 * 2. `scanStatus = pending` olarak DB'ye insert edilir.
 * 3. `FileService` adapter'dan `scan(key)` çağırır.
 * 4. Sonuç `clean/infected/skipped/error` olarak DB'ye yazılır.
 * 5. `infected` durumunda erişim reddedilir.
 *
 * @security
 * - Tarama asenkron ve timeout'lıdır (default 30 sn).
 * - Adapter exception'ları `error` durumuna map edilir; operatör
 *   incelemesi beklenir.
 * - `infected` dosyalar karantinaya alınır (indirme endpoint'i 404).
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import type { Readable } from "node:stream";

/**
 * Tarama sonucu. `FileMeta.scanStatus` enum ile birebir eşleşir.
 */
export type ScanOutcome = "clean" | "infected" | "skipped" | "error";

/**
 * Tarama sonucu detayı. `details` ClamAV stream çıktısı veya
 * VirusTotal raporunun kısa özetini içerir.
 */
export interface ScanResult {
  readonly outcome: ScanOutcome;
  /**
   * Tarama motoru tarafından üretilen serbest metin (örn. `OK`,
   * `Win.Test.EICAR_HDB-1`, hata mesajı). UI'da görüntülenir.
   */
  readonly details?: string;
  /**
   * Tarama süresi (ms). Performans metriği.
   */
  readonly durationMs: number;
}

/**
 * Scan adapter sözleşmesi.
 */
export interface ScanAdapter {
  /**
   * Adapter adı (log + metric). Örn. `noop`, `clamav`.
   */
  readonly name: string;

  /**
   * Verilen stream/buffer'ı tara. Result yukarıdaki `ScanResult`.
   *
   * @throws Adapter yalnızca transport hatasında exception fırlatır;
   * "zararlı bulundu" durumu `infected` outcome'u ile döner.
   */
  scan(input: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
  }): Promise<ScanResult>;

  /**
   * Sağlık kontrolü (ClamAV daemon bağlantısı, vb.).
   */
  healthCheck(): Promise<boolean>;
}
