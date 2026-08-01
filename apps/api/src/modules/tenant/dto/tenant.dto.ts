/**
 * @file Tenant DTO ve mapper.
 * @module apps/api/modules/tenant/dto
 *
 * @description Prisma modeli ile API response şeması arasındaki
 * dönüşüm. PII alanları (taxId, contactEmail) default olarak döner;
 * maskeleme üst katmanda (permission'a göre) yapılır.
 *
 * @security Model → response dönüşümünde hassas alanlar
 *   (`taxId`, `contactEmail`) null'lanabilir; bu karar permission
 *   katmanında verilir. Mapper yalnızca tip dönüşümü yapar.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import type { Tenant } from "@prisma/client";
import type { TenantResponse } from "@vetniva/contracts";

/**
 * Prisma Tenant modelini API response şemasına dönüştürür.
 */
export function toTenantResponse(t: Tenant): TenantResponse {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    country: t.country as TenantResponse["country"],
    defaultLocale: t.defaultLocale,
    timezone: t.timezone,
    status: t.status,
    taxId: t.taxId,
    taxIdType: (t.taxIdType as TenantResponse["taxIdType"]) ?? null,
    contactEmail: t.contactEmail,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
    archivedReason: t.archivedReason,
  };
}

/**
 * PII alanlarını mask'ler. SUPERADMIN tüm alanları görür; OWNER
 * kendi tenant'ını görür; diğer roller mask'li görür.
 *
 * @param response TenantResponse
 * @param canSeePii PII alanlarını mask'siz gösterebilir mi?
 */
export function maskTenantResponse(
  response: TenantResponse,
  canSeePii: boolean,
): TenantResponse {
  if (canSeePii) return response;
  return {
    ...response,
    taxId: response.taxId ? maskTaxId(response.taxId) : null,
    contactEmail: response.contactEmail
      ? maskEmail(response.contactEmail)
      : null,
  };
}

function maskTaxId(taxId: string): string {
  if (taxId.length < 5) return "***";
  return `${taxId.slice(0, 3)}***${taxId.slice(-2)}`;
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
