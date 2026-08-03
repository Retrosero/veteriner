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

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";

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
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public async persistedGetOrDefault(
    tenantId: string,
    enabled = true,
  ): Promise<TenantVaccineCardSettingRecord> {
    if (!this.prisma) return this.getOrDefault(tenantId, enabled);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.tenantVaccineCardSettingRecord.upsert({
        where: { tenantId },
        create: {
          tenantId,
          portalVaccineCardEnabled: enabled,
          updatedAt: new Date(),
        },
        update: {},
      }),
    );
    return {
      tenantId: row.tenantId,
      portalVaccineCardEnabled: row.portalVaccineCardEnabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  public async persistedUpsert(args: {
    tenantId: string;
    portalVaccineCardEnabled: boolean;
  }): Promise<TenantVaccineCardSettingRecord> {
    if (!this.prisma) return this.upsert(args);
    const row = await this.inTenant(args.tenantId, (tx) =>
      tx.tenantVaccineCardSettingRecord.upsert({
        where: { tenantId: args.tenantId },
        create: {
          tenantId: args.tenantId,
          portalVaccineCardEnabled: args.portalVaccineCardEnabled,
          updatedAt: new Date(),
        },
        update: {
          portalVaccineCardEnabled: args.portalVaccineCardEnabled,
          updatedAt: new Date(),
        },
      }),
    );
    return {
      tenantId: row.tenantId,
      portalVaccineCardEnabled: row.portalVaccineCardEnabled,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

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
  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return callback(tx);
    });
  }
}
