/**
 * @file Permission kataloğu (in-process hard-coded).
 * @module apps/api/common/rbac/permission-catalog
 *
 * @description Permission kataloğunun in-process hard-coded kısmı.
 * `permission-catalog.loader.ts` YAML'dan ana kataloğu yükler;
 * bu dosya ise katalogda olmayan ama runtime'da ihtiyaç duyulan
 * permission'ları hard-coded listeler (test kolaylığı + zero
 * YAML bağımlılığı).
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import type {
  PermissionDefinition,
} from "./permission.types.js";

/** Katalogda tanımlı olmayan ama runtime'da ihtiyaç duyulan
 *  permission'lar (auth/password reset gibi). */
export const PERMISSION_CATALOG: ReadonlyArray<PermissionDefinition> = [
  // Bu dosya FAZ-1'de boştur; tüm permission tanımları
  // `permission-catalog.loader.ts` aracılığıyla YAML'dan yüklenir.
  // Buradaki liste ileride (FAZ-2) hard-coded system permission'ları
  // için kullanılabilir.
];

/** Katalog lookup helper. */
export function findPermission(
  _key: string,
): PermissionDefinition | undefined {
  return undefined;
}

export function getPermissionIndex(): Map<string, PermissionDefinition> {
  return new Map();
}
