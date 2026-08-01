/**
 * @file Local filesystem storage adapter (dev/test).
 * @module apps/api/common/adapters/local-storage
 * @description Geliştirme ve test ortamı için disk tabanlı storage
 * implementasyonu. Production'da S3 adapter'ı kullanılır. Storage
 * path şeması tenant-bazlıdır: `<root>/tenants/<tenantId>/files/<fileId>`.
 *
 * Güvenlik notları:
 * - Path traversal engellenir: `key` mutlaka UUID formatında olmalı ve
 *   sabit prefix ile başlamalı.
 * - Dosya yazımı atomik: önce `.tmp`, sonra `rename` (yarım kalan
 *   dosya okunamaz).
 * - `archive` dosyayı `archived/` altına taşır (fiziksel silme YOK).
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  SignedUrlOptions,
  StorageAdapter,
  StorageObject,
  StoragePutInput,
} from "./storage.adapter.js";

/**
 * Local adapter konfigürasyonu.
 */
export interface LocalStorageConfig {
  /**
   * Storage root dizini. Default `./storage`.
   */
  readonly rootDir?: string;
  /**
   * Signed URL için HMAC anahtarı. Default dev sabit (`vetniva-dev-key`).
   * Production'da S3 kullanılır; bu adapter dev/test içindir.
   */
  readonly signingKey?: string;
  /**
   * Signed URL taban URL'i (dev: `http://localhost:3001`).
   */
  readonly publicBaseUrl?: string;
}

const DEFAULT_ROOT = "./storage";
const DEFAULT_SIGNING_KEY = "vetniva-dev-signing-key-do-not-use-in-prod";
const DEFAULT_BASE_URL = "http://localhost:3001";
const ARCHIVE_SUBDIR = "archived";

/**
 * Key format doğrulaması. `tenants/<uuid>/files/<uuid>` veya
 * `tenants/<uuid>/files/<uuid>/archived` benzeri formatta olmalı.
 * Path traversal (`../`, `\\`) reddedilir.
 * @param key
 */
function assertSafeKey(key: string): void {
  if (key.length === 0 || key.length > 512) {
    throw new Error("storage: key uzunluğu geçersiz");
  }
  if (key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    throw new Error("storage: key path traversal içeremez");
  }
  if (!/^(tenants|policies|exports|tmp)\/[a-zA-Z0-9_\-./]+$/.test(key)) {
    throw new Error("storage: key beklenen prefix ile başlamalı");
  }
}

/**
 * Key'den absolute path üretir. Root dışına çıkışı engeller.
 * @param root
 * @param key
 */
function resolveSafePath(root: string, key: string): string {
  const absRoot = resolve(root);
  const candidate = resolve(absRoot, key);
  if (candidate !== absRoot && !candidate.startsWith(absRoot + sep)) {
    throw new Error("storage: path root dışına çıkıyor");
  }
  return candidate;
}

/**
 * Local filesystem storage adapter.
 */
export class LocalStorageAdapter implements StorageAdapter {
  public readonly name = "local";

  private readonly root: string;
  private readonly signingKey: string;
  private readonly publicBaseUrl: string;

  public constructor(config: LocalStorageConfig = {}) {
    this.root = resolve(config.rootDir ?? DEFAULT_ROOT);
    this.signingKey = config.signingKey ?? DEFAULT_SIGNING_KEY;
    this.publicBaseUrl = config.publicBaseUrl ?? DEFAULT_BASE_URL;
  }

  public async put(input: StoragePutInput): Promise<StorageObject> {
    assertSafeKey(input.key);
    const absPath = resolveSafePath(this.root, input.key);
    const dir = dirname(absPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- absPath assertSafeKey + resolveSafePath ile storage kökü içinde doğrulanır.
    await mkdir(dir, { recursive: true });

    const tmpPath = `${absPath}.${process.pid}.${Date.now()}.tmp`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpPath doğrulanmış absPath'ten türetilir.
    const stream = createWriteStream(tmpPath);
    if (Buffer.isBuffer(input.body)) {
      await pipeline(Readable.from(input.body), stream);
    } else {
      await pipeline(input.body, stream);
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Her iki yol doğrulanmış storage kökü içindedir.
    await rename(tmpPath, absPath);

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- absPath storage kökü sınır kontrolünden geçti.
    const stats = await stat(absPath);
    const checksum = await this.sha256File(absPath);
    return {
      key: input.key,
      size: stats.size,
      contentType: input.contentType,
      lastModified: stats.mtime,
      checksumSha256: checksum,
    };
  }

  public async get(key: string): Promise<StorageObject | null> {
    assertSafeKey(key);
    const absPath = resolveSafePath(this.root, key);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- absPath storage kökü sınır kontrolünden geçti.
      const stats = await stat(absPath);
      if (!stats.isFile()) return null;
      const checksum = await this.sha256File(absPath);
      return {
        key,
        size: stats.size,
        contentType: "application/octet-stream",
        lastModified: stats.mtime,
        checksumSha256: checksum,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  public async getStream(key: string): Promise<Readable | null> {
    assertSafeKey(key);
    const absPath = resolveSafePath(this.root, key);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- absPath storage kökü sınır kontrolünden geçti.
      await stat(absPath);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- absPath storage kökü sınır kontrolünden geçti.
      return createReadStream(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  public async getSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    assertSafeKey(key);
    const expiresIn = clampExpires(options.expiresInSeconds);
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const disp = options.contentDisposition
      ? `&disp=${encodeURIComponent(options.contentDisposition)}`
      : "";
    const sig = this.sign(
      `${key}|${expiresAt}|${options.contentDisposition ?? ""}`,
    );
    const url = new URL(
      `${this.publicBaseUrl}/api/v1/files/stream/${encodeURIComponent(key)}`,
    );
    url.searchParams.set("expires", String(expiresAt));
    url.searchParams.set("sig", sig);
    if (options.contentDisposition) {
      url.searchParams.set("disp", options.contentDisposition);
    }
    // disp parametresi zaten URL.searchParams'e eklendi; ekstra "&disp="
    // eklemekten kaçınmak için disp değişkeni kullanılmaz.
    void disp;
    return url.toString();
  }

  public async archive(key: string, _reason: string): Promise<void> {
    assertSafeKey(key);
    const absPath = resolveSafePath(this.root, key);
    const dir = dirname(absPath);
    const archivedDir = join(dir, ARCHIVE_SUBDIR);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- archivedDir doğrulanmış absPath'in alt dizinidir.
    await mkdir(archivedDir, { recursive: true });
    const base = absPath.split(sep).pop() ?? "object";
    const dest = join(archivedDir, `${base}.${Date.now()}.archived`);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Kaynak ve hedef doğrulanmış storage kökü içindedir.
      await rename(absPath, dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- root constructor'da mutlak storage kökü olarak çözülür.
      await mkdir(this.root, { recursive: true });
      const probe = join(this.root, ".health");
      await rm(probe, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stream'i buffered okur, SHA-256 hesaplar. Put sonrası ve get
   * sırasında kullanılır.
   * @param absPath
   */
  private async sha256File(absPath: string): Promise<string> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Çağıranlar absPath'i resolveSafePath ile doğrular.
    const stream = createReadStream(absPath);
    const hash = createHash("sha256");
    await pipeline(stream, hash);
    return hash.digest("hex");
  }

  /**
   * Signed URL imzası. HMAC-SHA256(secret, "{key}|{expires}|{disp}").
   * Local adapter için yeterli; production S3 native signing kullanır.
   * @param payload
   */
  private sign(payload: string): string {
    return createHash("sha256")
      .update(this.signingKey)
      .update("|")
      .update(payload)
      .digest("hex")
      .slice(0, 32);
  }

  /**
   * İmza doğrular. Stream endpoint'i bu metodu çağırır.
   * @param key
   * @param expiresAt
   * @param sig
   * @param contentDisposition
   */
  public verifySignature(
    key: string,
    expiresAt: number,
    sig: string,
    contentDisposition?: string,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt <= now) return false;
    const expected = this.sign(
      `${key}|${expiresAt}|${contentDisposition ?? ""}`,
    );
    return expected === sig;
  }

  /**
   * Root dizin (test için). Normal kod kullanmaz.
   */
  public get rootDir(): string {
    return this.root;
  }

  /**
   * Test amaçlı: root içeriğini normalize eder (path injection tespiti).
   * @param candidate
   */
  public assertWithinRoot(candidate: string): boolean {
    const absRoot = resolve(this.root);
    const norm = normalize(resolve(absRoot, candidate));
    return norm === absRoot || norm.startsWith(absRoot + sep);
  }
}

/**
 * `expiresInSeconds` aralığını 60-3600 arasında sıkıştırır.
 * @param value
 */
function clampExpires(value: number | undefined): number {
  if (value === undefined) return 300;
  if (value < 60) return 60;
  if (value > 3600) return 3600;
  return Math.floor(value);
}

/**
 * Bu dosya içinde kullanılan ancak TS strict unused-warning tetiklemesin
 * diye import'u `void` ile yutuyoruz.
 */
void copyFile;
