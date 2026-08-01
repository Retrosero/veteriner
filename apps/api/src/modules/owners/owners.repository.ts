/**
 * @file Owner repository (in-memory).
 * @module apps/api/modules/owners/owners.repository
 *
 * @description Owner veri erişim katmanı. GOAL-020 kapsamında DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-020 (FAZ-2) hasta sahibi core
 */

import { Injectable } from "@nestjs/common";

import type {
  Owner,
  OwnerCreateInput,
} from "../../common/owners/owner.types.js";

/** Persist edilmiş owner (normalize edilmiş telefon + tenant + id). */
export interface OwnerRecord {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  taxId: string | null;
  address: Owner["address"];
  consents: Owner["consents"];
  createdAt: string;
  archivedAt: string | null;
}

@Injectable()
export class OwnersRepository {
  /** key: tenantId|normalizedPhone → record id. */
  private readonly byPhone = new Map<string, string>();
  /** key: record id → record. */
  private readonly byId = new Map<string, OwnerRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `own-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: OwnerRecord): OwnerRecord {
    this.byId.set(record.id, record);
    this.byPhone.set(this.phoneKey(record.tenantId, record.phone), record.id);
    return record;
  }

  public findById(tenantId: string, id: string): OwnerRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findByPhone(
    tenantId: string,
    normalizedPhone: string,
  ): OwnerRecord | null {
    const id = this.byPhone.get(this.phoneKey(tenantId, normalizedPhone));
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId || rec.archivedAt !== null) {
      return null;
    }
    return rec;
  }

  public update(record: OwnerRecord): OwnerRecord {
    this.byId.set(record.id, record);
    this.byPhone.set(this.phoneKey(record.tenantId, record.phone), record.id);
    return record;
  }

  /**
   * Tenant-scoped arama. `search` ad/soyad/telefon/email/taxId
   * üzerinde case-insensitive substring match yapar. Archive
   * edilmiş kayıtlar varsayılan olarak dışlanır; `includeArchived`
   * ile dahil edilebilir.
   */
  public search(
    tenantId: string,
    args: {
      search?: string | undefined;
      phone?: string | undefined;
      city?: string | undefined;
      limit: number;
      offset: number;
      includeArchived?: boolean | undefined;
    },
  ): { items: OwnerRecord[]; total: number } {
    const needle = args.search?.toLowerCase().trim();
    const phoneNeedle = args.phone?.replace(/\s/g, "");
    const cityNeedle = args.city?.toLowerCase().trim();

    const all: OwnerRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!args.includeArchived && rec.archivedAt !== null) continue;
      if (needle) {
        const hay = [
          rec.firstName,
          rec.lastName,
          rec.phone,
          rec.email ?? "",
          rec.taxId ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      if (phoneNeedle && !rec.phone.includes(phoneNeedle)) continue;
      if (cityNeedle) {
        const city = rec.address?.city?.toLowerCase() ?? "";
        if (!city.includes(cityNeedle)) continue;
      }
      all.push(rec);
    }
    // En yeni kayıt üstte.
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = all.length;
    const items = all.slice(args.offset, args.offset + args.limit);
    return { items, total };
  }

  public archive(tenantId: string, id: string, at: string): OwnerRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    rec.archivedAt = at;
    this.byId.set(id, rec);
    return rec;
  }

  /** Test yardımcısı: tüm veriyi temizler. */
  public clear(): void {
    this.byId.clear();
    this.byPhone.clear();
    this.counters.clear();
  }

  /** Record oluşturmak için yardımcı (service kullanır). */
  public toRecord(
    id: string,
    tenantId: string,
    input: OwnerCreateInput,
    normalized: { phone: string; taxId: string | null },
  ): OwnerRecord {
    return {
      id,
      tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: normalized.phone,
      email: input.email ?? null,
      taxId: normalized.taxId,
      address: input.address
        ? {
            city: input.address.city,
            district: input.address.district,
            ...(input.address.fullAddress !== undefined
              ? { fullAddress: input.address.fullAddress }
              : {}),
          }
        : null,
      consents: {
        kvkk: input.consentKvkk,
        marketing: input.consentMarketing,
      },
      createdAt: new Date().toISOString(),
      archivedAt: null,
    };
  }

  private phoneKey(tenantId: string, phone: string): string {
    return `${tenantId}|${phone}`;
  }
}
