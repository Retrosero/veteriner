/**
 * @file ClamAV scan adapter.
 * @module apps/api/common/adapters/clamav-scan
 * @description ClamAV antivirus daemon (`clamd`) üzerinden zararlı
 * içerik taraması yapan adapter. Production'da `SCAN_DRIVER=clamav`
 * env ile devreye alınır ve `clamd` INSTREAM protokolünü kullanır.
 *
 * Çalışma modu (gerçek):
 * 1. INSTREAM komutu: dosya boyutu (4 byte big-endian) + chunked
 *    stream + zero-length terminator.
 * 2. Sonuç: `OK`, `FOUND <signature>`, `ERROR`.
 * 3. Timeout: 30 sn (büyük dosyalar için).
 * @security
 * - Daemon unix socket üzerinden erişilir (TCP düşman ağda risk).
 * - Dosya boyutu > 100 MB → taranmaz; `skipped` döner (aşağıda).
 * - Timeout aşımı `error` döner; operatör incelemesi beklenir.
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { createConnection, type Socket } from "node:net";

import type { ScanAdapter, ScanResult } from "./scan.adapter.js";
import type { Readable } from "node:stream";

/**
 * ClamAV adapter konfigürasyonu.
 */
export interface ClamAvConfig {
  /**
   * Clamd unix socket yolu. Default `/var/run/clamav/clamd.ctl`.
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
 * ClamAV scan adapter. Unix socket veya TCP üzerinden `clamd` ile konuşur.
 * Tarama servisine erişilemezse exception fırlatır; çağıran servis bunu
 * `error` durumuna çevirir ve dosyayı indirmeye açmaz.
 */
export class ClamAvScanAdapter implements ScanAdapter {
  public readonly name = "clamav";

  private readonly config: Readonly<{
    socketPath: string | undefined;
    host: string | undefined;
    port: number | undefined;
    timeoutMs: number;
    maxScanSizeBytes: number;
  }>;

  public constructor(config: ClamAvConfig = {}) {
    this.config = {
      // TCP ayarları verildiyse varsayılan Unix socket'i seçme; aksi halde
      // CLAMAV_HOST yapılandırması etkisiz kalırdı.
      socketPath:
        config.socketPath ?? (config.host ? undefined : DEFAULT_SOCKET),
      host: config.host,
      port: config.port,
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
    const socket = await this.connect();
    try {
      const response = this.readResponse(socket);
      await this.write(socket, Buffer.from("zINSTREAM\0", "utf8"));

      let size = 0;
      for await (const chunk of this.chunks(input.body)) {
        size += chunk.byteLength;
        if (size > this.config.maxScanSizeBytes) {
          throw new Error("clamav_scan_size_limit_exceeded");
        }
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.byteLength, 0);
        await this.write(socket, length);
        await this.write(socket, chunk);
      }
      await this.write(socket, Buffer.alloc(4));

      const result = await response;
      const details = result.replace(/\0+$/, "").trim();
      if (/\bOK$/i.test(details)) {
        return { outcome: "clean", details, durationMs: Date.now() - start };
      }
      const found = details.match(/:\s*(.+?)\s+FOUND$/i);
      if (found?.[1]) {
        return {
          outcome: "infected",
          details: found[1],
          durationMs: Date.now() - start,
        };
      }
      throw new Error(`clamav_unexpected_response:${details || "empty"}`);
    } finally {
      socket.destroy();
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const socket = await this.connect();
      try {
        const response = this.readResponse(socket);
        await this.write(socket, Buffer.from("zPING\0", "utf8"));
        return (await response).replace(/\0+$/, "").trim() === "PONG";
      } finally {
        socket.destroy();
      }
    } catch {
      return false;
    }
  }

  /** TCP veya Unix socket bağlantısı kurar ve zaman aşımını uygular. */
  private connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = this.config.socketPath
        ? createConnection(this.config.socketPath)
        : createConnection({
            host: this.config.host ?? "127.0.0.1",
            port: this.config.port ?? 3310,
          });
      socket.setTimeout(this.config.timeoutMs);
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error("clamav_timeout"));
      });
    });
  }

  /** Yanıt NUL ile sonlanır; eski daemon'larda socket kapanışı da kabul edilir. */
  private readResponse(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const finish = (): void =>
        resolve(Buffer.concat(chunks).toString("utf8"));
      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        if (chunk.includes(0)) finish();
      });
      socket.once("end", finish);
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("clamav_timeout")));
    });
  }

  /** Socket backpressure'ını koruyarak bütün veriyi yazar. */
  private write(socket: Socket, chunk: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(chunk, (error) => (error ? reject(error) : resolve()));
    });
  }

  /** Buffer ve Readable kaynaklarını aynı akışta temsil eder.
   * @yields Dosya içeriğinin güvenli Buffer parçalarını.
   */
  private async *chunks(body: Buffer | Readable): AsyncIterable<Buffer> {
    if (Buffer.isBuffer(body)) {
      yield body;
      return;
    }
    for await (const chunk of body) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    }
  }
}
