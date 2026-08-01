/**
 * @file Local disk storage driver (FAZ-0).
 * @module apps/api/common/files/local-storage.driver
 * @description Dosyaları yerel disk üzerinde `uploads/{tenantId}/{category}/
 * {yyyy}/{mm}/{fileId}.{ext}` path'inde saklar. FAZ-0 için disk tabanlı;
 * test veya development için opsiyonel in-memory mod destekler. S3 / object
 * storage entegrasyonu FAZ-14+'da devreye girer.
 * @security `path` alanı `path.resolve` ile normalize edilir;
 *   `..` segmentleri root dışına çıkmayı engeller. Signed URL
 *   HMAC-SHA256 ile imzalanır; süre dolmuş URL'ler proxy
 *   controller tarafından reddedilir.
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

import * as crypto from "node:crypto";
import { promises as fsp } from "node:fs";
import * as path from "node:path";

import { Injectable, Logger } from "@nestjs/common";

import type { StorageDriver } from "./storage.interface.js";

/**
 * Yerel disk üzerinde çalışan storage driver. Constructor'da
 * `memStore` verilirse disk yerine belleğe yazar (test kolaylığı);
 * aksi halde `rootDir` altında gerçek dosya işlemi yapar.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly logger = new Logger(LocalStorageDriver.name);
  private readonly rootDir: string;
  private readonly memStore: Map<string, Buffer> | null;

  /**
   * Doğrulanmış uploads kökü veya test için bellek deposuyla driver oluşturur.
   * @param rootDir Kök dizin. Varsayılan: `process.cwd()/uploads`.
   * @param memStore Opsiyonel in-memory store. Verilirse disk I/O
   *   atlanır; test'lerde kullanılır.
   */
  public constructor(rootDir?: string, memStore?: Map<string, Buffer>) {
    this.rootDir = rootDir ?? path.resolve(process.cwd(), "uploads");
    this.memStore = memStore ?? null;
  }

  public async put(
    filePath: string,
    data: Buffer,
    _mime: string,
  ): Promise<void> {
    const resolved = this.resolveSafe(filePath);
    if (this.memStore !== null) {
      this.memStore.set(resolved, Buffer.from(data));
      return;
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved, resolveSafe ile uploads kökü içinde doğrulanır.
    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved, resolveSafe ile uploads kökü içinde doğrulanır.
    await fsp.writeFile(resolved, data);
    this.logger.debug(
      { path: resolved, size: data.length },
      "local-storage.put",
    );
  }

  public async get(filePath: string): Promise<Buffer> {
    const resolved = this.resolveSafe(filePath);
    if (this.memStore !== null) {
      const data = this.memStore.get(resolved);
      if (!data) {
        throw new Error(`File not found in memory store: ${filePath}`);
      }
      return Buffer.from(data);
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved, resolveSafe ile uploads kökü içinde doğrulanır.
    return fsp.readFile(resolved);
  }

  public async delete(filePath: string): Promise<void> {
    const resolved = this.resolveSafe(filePath);
    if (this.memStore !== null) {
      this.memStore.delete(resolved);
      return;
    }
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved, resolveSafe ile uploads kökü içinde doğrulanır.
      await fsp.unlink(resolved);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
  }

  public async signedUrl(
    filePath: string,
    expiresInSec: number,
  ): Promise<string> {
    if (!Number.isFinite(expiresInSec) || expiresInSec <= 0) {
      throw new Error("expiresInSec must be a positive number");
    }
    const expires = Math.floor(Date.now() / 1000) + expiresInSec;
    const payload = `${filePath}:${expires}`;
    const sig = crypto
      .createHmac("sha256", this.signingSecret())
      .update(payload)
      .digest("hex")
      .slice(0, 32);
    const params = new URLSearchParams({ expires: String(expires), sig });
    return `/api/v1/files/proxy?path=${encodeURIComponent(filePath)}&${params.toString()}`;
  }

  /**
   * Path'i root altında normalize eder. Root dışına çıkan path'ler
   * hata fırlatır (path traversal engeli).
   * @param filePath
   */
  private resolveSafe(filePath: string): string {
    if (filePath.includes("\0")) {
      throw new Error("Invalid path (null byte)");
    }
    const root = path.resolve(this.rootDir);
    const resolved = path.resolve(root, filePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`Path traversal attempt: ${filePath}`);
    }
    return resolved;
  }

  private signingSecret(): string {
    return (
      process.env["FILE_SIGNING_SECRET"] ??
      "vetniva-dev-secret-do-not-use-in-prod"
    );
  }
}
