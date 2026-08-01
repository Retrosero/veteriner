/**
 * @file Parola hashleme ve doğrulama.
 * @module apps/api/common/auth/password
 * @description Bcryptjs (pure-JS) ile parola hash üretimi ve doğrulaması.
 * Native build gerektirmez; Windows + OneDrive ortamında sorunsuz
 * çalışır. Cost factor 12 (OWASP önerisi).
 *
 * Güvenlik:
 * - Plain parola yalnızca hash üretimi ve doğrulama sırasında bellekte
 *   bulunur; loglanmaz, audit payload'ına dahil edilmez, hata mesajına
 *   yansımaz.
 * - Hash formatı: `$2a$<cost>$<salt+hash>` (bcrypt standart).
 * - Salt üretimi bcrypt tarafından dahili yapılır; ek salt tutulmaz.
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { BCRYPT_COST } from "@vetniva/contracts";
import { compare, hash } from "bcryptjs";

/** Minimum parola uzunluğu (policy). */
export const MIN_PASSWORD_LENGTH = 12 as const;

/**
 * Plain parolayı bcrypt ile hash'ler.
 * @param plain Plain parola (minimum 12 karakter policy ile).
 * @returns `$2a$12$...` formatında hash.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error("Parola politikasına uygun değil");
  }
  return hash(plain, BCRYPT_COST);
}

/**
 * Parolayı doğrular. Constant-time karşılaştırma bcryptjs.compare
 * tarafından sağlanır.
 * @param plain Kullanıcının girdiği plain parola.
 * @param hashed DB'deki bcrypt hash.
 * @returns Eşleşiyorsa true.
 */
export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  if (!plain || !hashed) return false;
  try {
    return await compare(plain, hashed);
  } catch {
    return false;
  }
}
