/**
 * @file Brute-force koruması.
 * @module apps/api/common/auth/brute-force
 * @description Email ve IP başına başarısız login denemesi sayacı.
 * In-memory Map ile hızlı kontrol; cluster ortamında Redis'e
 * taşınabilir (GOAL-100+ ile).
 *
 * Politika (GOAL-011):
 * - 5 başarısız deneme → hesap 15 dakika kilitlenir.
 * - Kilit süresi içinde login denemeleri reddedilir.
 * - Başarılı login sayacı sıfırlar.
 * - Sayaç per email tutulur (email enumeration saldırılarına karşı
 *   mesaj genelleştirilir; gerçek sayaç yalnızca internal log'ta).
 *
 * Bu servis DB ile senkronize değildir; kalıcı sayaç DB'de
 * `User.failedLoginCount` + `User.lockedUntil` üzerinden takip edilir.
 * In-memory katman hızlı "çok deneme" tespiti içindir; DB katmanı
 * daima önceliklidir.
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ACCOUNT_LOCK_SECONDS,
  MAX_FAILED_LOGIN_COUNT,
} from "@vetniva/contracts";

interface AttemptEntry {
  count: number;
  windowStart: number;
  lastAttempt: number;
}

/**
 * Brute-force koruması servisi. In-memory sayaç tutar; eşik
 * aşılınca lockout önerir. DB katmanındaki `User.lockedUntil` ile
 * birlikte çalışır.
 */
@Injectable()
export class BruteForceGuard {
  private readonly logger = new Logger(BruteForceGuard.name);
  private readonly attempts = new Map<string, AttemptEntry>();

  /** In-memory entry'lerin TTL'i (saniye). Eski kayıtlar GC ile silinir. */
  private static readonly ENTRY_TTL_SECONDS = 60 * 60; // 1 saat

  /**
   * Başarısız login denemesi kaydeder. Eşik aşıldıysa true döner
   * (lockout uygulanmalı).
   * @param key Genelde normalize email; IP de olabilir.
   */
  public recordFailure(key: string): boolean {
    const now = Date.now();
    const existing = this.attempts.get(key);
    if (!existing) {
      this.attempts.set(key, {
        count: 1,
        windowStart: now,
        lastAttempt: now,
      });
      return false;
    }
    existing.count += 1;
    existing.lastAttempt = now;
    if (existing.count >= MAX_FAILED_LOGIN_COUNT) {
      this.logger.warn(
        `Brute-force eşiği aşıldı: key=${this.maskKey(key)} count=${existing.count}`,
      );
      return true;
    }
    return false;
  }

  /**
   * Başarılı login sonrası sayacı sıfırlar.
   * @param key
   */
  public recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  /**
   * Bu anahtar şu an kilitli mi? (in-memory karar).
   * @param key
   */
  public isLocked(key: string): boolean {
    const entry = this.attempts.get(key);
    if (!entry) return false;
    if (entry.count < MAX_FAILED_LOGIN_COUNT) return false;
    const elapsed = (Date.now() - entry.lastAttempt) / 1000;
    return elapsed < ACCOUNT_LOCK_SECONDS;
  }

  /**
   * Lockout için kalan süre (saniye). Kilitli değilse 0.
   * @param key
   */
  public remainingLockSeconds(key: string): number {
    const entry = this.attempts.get(key);
    if (!entry) return 0;
    if (entry.count < MAX_FAILED_LOGIN_COUNT) return 0;
    const elapsed = (Date.now() - entry.lastAttempt) / 1000;
    const remaining = ACCOUNT_LOCK_SECONDS - elapsed;
    return remaining > 0 ? Math.ceil(remaining) : 0;
  }

  /**
   * GC: eski entry'leri temizle. Test/admin tarafından çağrılır;
   * periyodik tetikleme (cron) ileride eklenecek.
   */
  public gc(): number {
    const now = Date.now();
    const ttl = BruteForceGuard.ENTRY_TTL_SECONDS * 1000;
    let removed = 0;
    for (const [k, v] of this.attempts) {
      if (now - v.lastAttempt > ttl) {
        this.attempts.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Email veya IP'yi mask'ler (PII log koruması).
   * @param key
   */
  private maskKey(key: string): string {
    if (key.includes("@")) {
      const parts = key.split("@");
      const local = parts[0] ?? "";
      const domain = parts[1] ?? "";
      const maskedLocal =
        local.length <= 2 ? "*".repeat(local.length) : `${local[0] ?? "*"}***`;
      return `${maskedLocal}@${domain}`;
    }
    // IP: son oktet mask'lenir.
    return key.replace(/\.\d+$/, ".***");
  }
}
