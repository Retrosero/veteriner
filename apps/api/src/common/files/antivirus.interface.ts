/**
 * @file Antivirus driver sözleşmesi.
 * @module apps/api/common/files/antivirus.interface
 *
 * @description Upload edilen dosyaların malware taraması için
 * soyutlama. FAZ-0'da `ClamAvAntivirusDriver` placeholder'ı
 * "clean" döner; FAZ-10+ ClamAV daemon veya cloud scanner
 * (VirusTotal vb.) entegrasyonu yapılacak.
 *
 * @security Tarama asenkron ve timeout'lu çalışmalıdır; uzun
 *   süren tarama upload'u bloklamaz. "Infected" sonucu
 *   VET-FILE-0004 (422) ile reddedilir.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

/**
 * Tarama sonucu.
 * - `clean`: zararlı bulunmadı.
 * - `infected`: zararlı tespit edildi; upload reddedilir.
 * - `error`: tarama altyapısı yanıt vermedi; policy'ye göre
 *   `clean` veya `infected` muamelesi yapılır (default: infected).
 */
export type AntivirusResult = "clean" | "infected" | "error";

/**
 * Antivirus driver interface. Tüm implementasyonlar aynı sözleşmeyi
 * uygular.
 */
export interface AntivirusDriver {
  /**
   * Binary içeriği tarar. Timeout aşılırsa veya bağlantı kurulamazsa
   * `error` döner.
   */
  scan(data: Buffer, mime: string): Promise<AntivirusResult>;
}

/**
 * Antivirus driver token. NestJS DI'da inject için.
 */
export const ANTIVIRUS_DRIVER = Symbol("ANTIVIRUS_DRIVER");
