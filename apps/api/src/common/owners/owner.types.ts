/**
 * @file Owner (hasta sahibi) domain tipleri.
 * @module apps/api/common/owners/owner.types
 *
 * @description GOAL-020 hasta sahibi kayıt ve arama domain modeli.
 * Multi-tenant bir ortamda hasta sahibini temsil eder; tüm PII
 * tenant kapsamında izole edilir ve soft-delete (archive) ile
 * korunur (klinik kayıtlar append-only / versiyonlanır).
 *
 * Adres yapısı ülke adaptöründen bağımsız tutulur; ileride
 * (Faz 14+) `formatAddress` ile ülke formatına dönüştürülür.
 *
 * @since GOAL-020 (FAZ-2) hasta sahibi core
 */

export interface OwnerAddress {
  city: string;
  district: string;
  fullAddress?: string | undefined;
}

export interface OwnerConsents {
  kvkk: boolean;
  marketing: boolean;
}

export interface OwnerCreateInput {
  firstName: string;
  lastName: string;
  /** Ham telefon — service E.164'a normalize eder. */
  phone: string;
  email?: string | undefined;
  /** 11 hane → TCKN, 10 hane → VKN. */
  taxId?: string | undefined;
  address?: OwnerAddress | undefined;
  /** KVKK açık rızası (zorunlu, false ise 422). */
  consentKvkk: boolean;
  consentMarketing: boolean;
}

export interface OwnerFilters {
  search?: string | undefined;
  phone?: string | undefined;
  city?: string | undefined;
  limit: number;
  offset: number;
}

export interface Owner {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  /** E.164 normalize telefon. */
  phone: string;
  email: string | null;
  taxId: string | null;
  address: OwnerAddress | null;
  consents: OwnerConsents;
  /** ISO 8601 UTC. */
  createdAt: string;
  archivedAt: string | null;
}
