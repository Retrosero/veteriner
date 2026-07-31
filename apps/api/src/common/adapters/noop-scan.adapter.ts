/**
 * @file Noop scan adapter (dev/test).
 * @module apps/api/common/adapters/noop-scan
 *
 * @description Geliştirme ve test ortamı için tarama atlayan
 * implementasyon. Tüm dosyaları `skipped` olarak işaretler; production
 * ortamında ClamAV adapter devreye alınır.
 *
 * Test senaryoları: `scanStatus = skipped` olan dosyalar indirilebilir;
 * infected testi için `MockScanAdapter` (vitest) ile davranış değiştirilir.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

import type { ScanAdapter, ScanResult } from "./scan.adapter.js";

/**
 * Noop scan adapter. Stream'i tamamen tüketir (backpressure'ı önlemek
 * için), `skipped` döner.
 */
export class NoopScanAdapter implements ScanAdapter {
  public readonly name = "noop";

  public async scan(input: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
  }): Promise<ScanResult> {
    const start = Date.now();
    if (!Buffer.isBuffer(input.body)) {
      // Stream'i sonuna kadar oku; aksi halde backpressure birikir.
      await pipeline(input.body, async function* (source) {
        for await (const _chunk of source) {
          yield _chunk;
        }
      });
    }
    return {
      outcome: "skipped",
      details: "scan atlandı (dev ortamı)",
      durationMs: Date.now() - start,
    };
  }

  public async healthCheck(): Promise<boolean> {
    return true;
  }
}
