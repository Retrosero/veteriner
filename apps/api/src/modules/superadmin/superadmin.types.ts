/**
 * @file Superadmin tenant görünümü — internal tipler.
 * @module apps/api/modules/superadmin/superadmin.types
 *
 * @description SuperadminService için yardımcı filtre ve detay
 * tipleri. Şema tarafı (`packages/contracts/src/superadmin.ts`) ile
 * bire bir uyumlu; burada yalnızca service-internal type'lar.
 *
 * @since GOAL-016 (FAZ-1) superadmin tenant görünümü
 */

import type { TenantStatus, TenantCountry } from "@vetniva/contracts";

/** listTenants için opsiyonel filtre seti. */
export interface ListTenantsFilter {
  status?: TenantStatus;
  country?: TenantCountry;
  search?: string;
}
