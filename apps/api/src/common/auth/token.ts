/**
 * @file Secure token üretimi ve SHA-256 hash'leme.
 * @module apps/api/common/auth/token
 *
 * @description Session, davet ve parola sıfırlama token'ları için
 * güvenli rastgele değer üretir. Plain token sadece response'da
 * kullanıcıya döner; DB'de yalnızca SHA-256 hash bulunur.
 *
 * Token formatı: 64 hex karakter (32 byte). Yeterli entropi (~256 bit)
 * ve URL-dostu. Base64 alternatifi yerine hex seçildi: log/audit'te
 * daha okunabilir ve URL encode gerektirmez.
 *
 * @security
 * - `randomBytes` (Node crypto) — CSPRNG.
 * - SHA-256 DB'de; plain token asla loglanmaz.
 * - Hash üretiminde timing attack riski yok; SHA-256 her zaman aynı
 *   sürede çalışır.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { createHash, randomBytes } from "node:crypto";

/** Token byte uzunluğu (32 byte = 256 bit = 64 hex karakter). */
const TOKEN_BYTES = 32 as const;

/**
 * Plain token üretir (hex string). Yalnızca response'da kullanıcıya
 * döner; DB'ye asla plain yazılmaz.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Plain token'ın SHA-256 hash'ini üretir. DB'de bu hash saklanır.
 * Doğrulama `hashToken(plain) === stored` şeklinde yapılır.
 */
export function hashToken(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

/**
 * Constant-time string karşılaştırma. Token doğrulamada
 * `===` yerine bu kullanılmalı.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
