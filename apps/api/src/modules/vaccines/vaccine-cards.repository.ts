/**
 * @file Vaccine card (aşı kartı) repository (in-memory).
 * @module apps/api/modules/vaccines/vaccine-cards.repository
 *
 * @description GOAL-052 aşı kartı için tenant portal ayarı
 * (in-memory). Şimdilik yalnızca `portalVaccineCardEnabled`
 * bayrağı; diğer tenant ayarları tenant-settings modülü ile
 * genişletilecek. Production'a geçişte Prisma
 * `TenantVaccineCardSetting` tablosu ile değiştirilecek
 * (API sözleşmesi sabit).
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-052 (FAZ-5) aşı kartı core
 */

import { Injectable } from "@nestjs/common";

import type { TenantVaccineCardPortalSetting } from "@vetniva/contracts";

/** Persist edilmiş tenant aşı kartı portal ayarı. */
export interface TenantVaccineCardSettingRecord {
  tenantId: string;
  portalVaccineCardEnabled: boolean;
  updatedAt: string;
}

@Injectable()
export class VaccineCardsRepository {
  /** key: tenantId → record. */
  private readonly byTenant = new Map<string, TenantVaccineCardSettingRecord>();

  /**
   * Ayarı getir. Tenant için kayıt yoksa `null` döner
   * (default = portal açık; service katmanı default'u uygular).
   */
  public find(tenantId: string): TenantVaccineCardSettingRecord | null {
    return this.byTenant.get(tenantId) ?? null;
  }

  /**
   * Ayarı getir veya default oluştur. `enabled` parametresi
   * default davranışı belirler (default = true).
   */
  public getOrDefault(
    tenantId: string,
    enabled: boolean = true,
  ): TenantVaccineCardSettingRecord {
    const existing = this.byTenant.get(tenantId);
    if (existing) return existing;
    const nowIso = new Date().toISOString();
    const rec: TenantVaccineCardSettingRecord = {
      tenantId,
      portalVaccineCardEnabled: enabled,
      updatedAt: nowIso,
    };
    this.byTenant.set(tenantId, rec);
    return rec;
  }

  /**
   * Ayarı yaz (upsert). Geçerli ISO zaman damgası ile günceller.
   */
  public upsert(args: {
    tenantId: string;
    portalVaccineCardEnabled: boolean;
  }): TenantVaccineCardSettingRecord {
    const nowIso = new Date().toISOString();
    const rec: TenantVaccineCardSettingRecord = {
      tenantId: args.tenantId,
      portalVaccineCardEnabled: args.portalVaccineCardEnabled,
      updatedAt: nowIso,
    };
    this.byTenant.set(args.tenantId, rec);
    return rec;
  }

  /** Record → public. */
  public toPublic(
    rec: TenantVaccineCardSettingRecord,
  ): TenantVaccineCardPortalSetting {
    return {
      tenantId: rec.tenantId,
      portalVaccineCardEnabled: rec.portalVaccineCardEnabled,
      updatedAt: rec.updatedAt,
    };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byTenant.clear();
  }
}
