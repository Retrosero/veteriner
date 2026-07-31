/**
 * @file ClamAV scan adapter (skeleton).
 * @module apps/api/common/adapters/clamav-scan
 *
 * @description ClamAV antivirus daemon (`clamd`) üzerinden zararlı
 * içerik taraması yapan adapter iskeleti. Production'da
 * `SCAN_DRIVER=clamav` env ile devreye alınır; bu adapter gerçek
 * `clamd` socket/protokol implementasyonu içermez.
 *
 * Çalışma modu (gerçek):
 * 1. INSTREAM komutu: dosya boyutu (4 byte little-endian) + chunked
 *    stream + zero-length terminator.
 * 2. Sonuç: `OK`, `FOUND <signature>`, `ERROR`.
 * 3. Timeout: 30 sn (büyük dosyalar için).
 *
 * @security
 * - Daemon unix socket üzerinden erişilir (TCP düşman ağda risk).
 * - Dosya boyutu > 100 MB → taranmaz; `skipped` döner (aşağıda).
 * - Timeout aşımı `error` döner; operatör incelemesi beklenir.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

import type { ScanAdapter, ScanResult } from "./scan.adapter.js";

/**
 * ClamAV adapter konfigürasyonu.
 */
export interface ClamAvConfig {
  /**
   * clamd unix socket yolu. Default `/var/run/clamav/clamd.ctl`.
   */
  readonly socketPath?: string;
  /**
   * Veya TCP host:port. `socketPath` set edilmişse bu yok sayılır.
   */
  readonly host?: string;
  readonly port?: number;
  /**
   * Tarama timeout (ms). Default 30_000.
   */
  readonly timeoutMs?: number;
  /**
   * Bu boyutun üstündeki dosyalar taranmaz (`skipped`). Default 100 MB.
   */
  readonly maxScanSizeBytes?: number;
}

const DEFAULT_SOCKET = "/var/run/clamav/clamd.ctl";
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_SCAN_SIZE = 100 * 1024 * 1024;

/**
 * ClamAV scan adapter. Bu sınıf skeleton; gerçek `clamd` protokolü
 * (INSTREAM komutu + yanıt ayrıştırma) sonraki tick'lerde eklenecek.
 *
 * Şu an:
 * - Sağlık kontrolü config doğrulaması yapar.
 * - `scan` çağrısı `skipped` döner + uyarı loglar (production'da
 *   gerçek implementasyon bekleniyor).
 */
export class ClamAvScanAdapter implements ScanAdapter {
  public readonly name = "clamav";

  private readonly config: Required<
    Pick<ClamAvConfig, "socketPath" | "timeoutMs" | "maxScanSizeBytes">
  > &
    ClamAvConfig;

  public constructor(config: ClamAvConfig = {}) {
    this.config = {
      ...config,
      socketPath: config.socketPath ?? DEFAULT_SOCKET,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT,
      maxScanSizeBytes: config.maxScanSizeBytes ?? DEFAULT_MAX_SCAN_SIZE,
    };
  }

  public async scan(input: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
  }): Promise<ScanResult> {
    const start = Date.now();
    // Stream'i tüket (backpressure).
    if (!Buffer.isBuffer(input.body)) {
      await pipeline(input.body, async function* (source) {
        for await (const _chunk of source) {
          yield _chunk;
        }
      });
    }

    // TODO(GOAL-014+): clamd INSTREAM protokolü.
    // Şimdilik güvenli yol: skipped + warning log.
    void input.key;
    void input.contentType;
    return {
      outcome: "skipped",
      details: "clamav adapter skeleton; INSTREAM henüz implemente edilmedi",
      durationMs: Date.now() - start,
    };
  }

  public async healthCheck(): Promise<boolean> {
    // TODO(GOAL-014+): PING komutu + beklenen `PONG` cevabı.
    return Boolean(this.config.socketPath || (this.config.host && this.config.port));
  }
}
