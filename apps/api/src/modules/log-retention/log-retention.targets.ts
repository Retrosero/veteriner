/**
 * @file Log retention target sözleşmesi.
 * @module apps/api/modules/log-retention/log-retention.targets
 *
 * @description GOAL-106 (FAZ-10) her log modülü (error-events,
 * security-events, job-runs) kendi kayıtlarını süpürme yeteneğini
 * `LogRetentionTarget` arayüzü ile dışa açar. Retention service
 * bu arayüz üzerinden tüm log türlerini tek noktadan yönetir.
 *
 * `expireOlderThan` iki modlu çalışır:
 * - `archive=true`  : cutoff'tan eski kayıtlar `archiveStorage`
 *   katmanına taşınır (cold storage adapter sonraki teslimatta
 *   bağlanacaktır).
 * - `archive=false` : cutoff'tan eski kayıtlar kalıcı depodan silinir.
 *
 * `redactPii=true` ise archive öncesi payload `masker.mask(...)`
 * ile mask'lenir (PII tespit edilebilen alanlar `[redacted]`,
 * email `a***@***` vb.).
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import type { PiiMasker } from "../../common/logging/pii-masker.js";
import type { LogType, ArchiveStorage } from "@vetniva/contracts";

/** `expireOlderThan` ortak argümanları. */
export interface ExpireOlderThanArgs {
  /** ISO datetime. `lastSeenAt`/`startedAt` <= cutoff olan kayıtlar
   *  etkilenir. */
  cutoff: string;
  /** Tenant filtresi (null = global, undefined = tüm tenant'lar). */
  tenantId?: string | null | undefined;
  /** true → arşive taşı (varsa cold storage adapter), false → sil. */
  archive: boolean;
  /** `archive=true` durumunda hedef storage katmanı. */
  archiveStorage?: ArchiveStorage;
  /** Arşiv öncesi PII mask uygulansın mı? */
  redactPii: boolean;
  /** PII mask için kullanılacak masker. */
  masker: PiiMasker;
  /** Uygulama sürümü (audit izi). */
  release: string;
}

/** Count argümanları (dry-run). */
export interface CountOlderThanArgs {
  cutoff: string;
  tenantId?: string | null | undefined;
}

/**
 * Log retention target sözleşmesi. Her log modülü kendi
 * repository'sini sarmalayan bir provider ile bu arayüzü implemente
 * eder. Retention service DI üzerinden hedef listesi alır.
 */
export interface LogRetentionTarget {
  /** Hangi logType için kullanılacak. */
  readonly logType: LogType;
  /** Bilinen tenantId listesi (sweep için). null dahil. */
  listTenantIds(): Array<string | null>;
  /** Cutoff'tan eski kayıtları arşivle/sil. Etkilenen kayıt sayısı. */
  expireOlderThan(args: ExpireOlderThanArgs): number | Promise<number>;
  /** Dry-run sayımı. */
  countOlderThan(args: CountOlderThanArgs): number;
}

/** DI token. */
export const LOG_RETENTION_TARGETS = Symbol("LOG_RETENTION_TARGETS");
