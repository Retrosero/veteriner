/**
 * @file Modül kataloğu (feature flag) tip tanımları.
 * @module apps/api/common/modules/module.types
 *
 * @description VetNiva'da tenant bazında açılıp kapatılabilen iş
 * modüllerinin tip tanımı. `ModuleKey` hem client hem server
 * tarafında paylaşılır; ileride `packages/contracts` altına da
 * taşınabilir (şimdilik backend-internal).
 *
 * NOT: Bu dosya DB schema'sından BAĞIMSIZDIR. Tenant bazında modül
 * açma/kapama GOAL-013 ile birlikte in-memory Map üzerinden
 * çalışır; ileride (GOAL-020+) Prisma `TenantModule` tablosuna
 * taşınacak. Yeni modül eklerken yalnızca bu listeyi güncellemek
 * yeterlidir; default davranış tüm modüllerin "enabled" olmasıdır.
 *
 * @since GOAL-013 (FAZ-1) modül/feature flag altyapısı
 */

import { z } from "zod";

/**
 * Tenant bazında açılıp kapatılabilen iş modülleri. Sıralı sabit
 * (frozen) liste: ileride UI sıralaması için kaynak nokta.
 */
export const ALL_MODULE_KEYS = [
  "clinic",
  "appointments",
  "vaccinations",
  "inventory",
  "petshop",
  "billing",
  "hospitalization",
  "laboratory",
  "imaging",
  "portal",
] as const;

export type ModuleKey = (typeof ALL_MODULE_KEYS)[number];

/**
 * Zod şeması — request payload doğrulaması için. Liste ile
 * otomatik senkronize.
 */
export const moduleKeySchema = z.enum(ALL_MODULE_KEYS);

/**
 * `isModuleKey()` runtime guard. Güvenilmeyen kaynaklardan gelen
 * string'ler için kullanılır (ör. URL path param).
 */
export function isModuleKey(value: unknown): value is ModuleKey {
  return (
    typeof value === "string" &&
    (ALL_MODULE_KEYS as ReadonlyArray<string>).includes(value)
  );
}
