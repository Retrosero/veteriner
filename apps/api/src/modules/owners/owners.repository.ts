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

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma, type Owner as PrismaOwner } from "@prisma/client";

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
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Uygulama çalışma zamanındaki kalıcı yol. Unit testlerde Prisma verilmezse
   * aynı sözleşme in-memory yardımcılarıyla korunur.
   */
  public async persist(record: OwnerRecord): Promise<OwnerRecord> {
    if (!this.prisma) return this.insert(record);
    // Geçiş döneminde owner'ı kullanan eski bellek tabanlı modüller için
    // aynı süreçte okunabilir kopya tutulur; yetkili kaynak PostgreSQL'dir.
    this.insert(record);
    const saved = await this.withTenant(record.tenantId, (tx) => tx.owner.create({ data: {
      id: record.id, tenantId: record.tenantId, firstName: record.firstName,
      lastName: record.lastName, phone: record.phone, email: record.email,
      taxId: record.taxId, address: record.address ? (record.address as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      consents: record.consents as unknown as Prisma.InputJsonValue, createdAt: new Date(record.createdAt),
    }}));
    return this.fromPrisma(saved);
  }

  public async findPersistedById(tenantId: string, id: string): Promise<OwnerRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.withTenant(tenantId, (tx) => tx.owner.findUnique({ where: { id } }));
    return row ? this.fromPrisma(row) : null;
  }

  public async findPersistedByPhone(tenantId: string, phone: string): Promise<OwnerRecord | null> {
    if (!this.prisma) return this.findByPhone(tenantId, phone);
    const row = await this.withTenant(tenantId, (tx) => tx.owner.findFirst({ where: { tenantId, phone, archivedAt: null } }));
    return row ? this.fromPrisma(row) : null;
  }

  public async searchPersisted(tenantId: string, args: Parameters<OwnersRepository["search"]>[1]): Promise<{ items: OwnerRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, args);
    const term = args.search?.trim(); const city = args.city?.trim();
    const where: Prisma.OwnerWhereInput = {
      tenantId, ...(args.includeArchived ? {} : { archivedAt: null }),
      ...(args.phone ? { phone: { contains: args.phone.replace(/\s/g, "") } } : {}),
      ...(term ? { OR: ["firstName", "lastName", "phone", "email", "taxId"].map((field) => ({ [field]: { contains: term, mode: "insensitive" } })) } : {}),
      ...(city ? { address: { path: ["city"], string_contains: city } } : {}),
    };
    const result = await this.withTenant(tenantId, async (tx) => Promise.all([
      tx.owner.findMany({ where, orderBy: { createdAt: "desc" }, skip: args.offset, take: args.limit }), tx.owner.count({ where }),
    ]));
    return { items: result[0].map((row) => this.fromPrisma(row)), total: result[1] };
  }

  public async archivePersisted(tenantId: string, id: string, at: string): Promise<OwnerRecord | null> {
    if (!this.prisma) return this.archive(tenantId, id, at);
    const row = await this.withTenant(tenantId, (tx) => tx.owner.updateMany({ where: { id, tenantId }, data: { archivedAt: new Date(at) } }));
    return row.count ? this.findPersistedById(tenantId, id) : null;
  }

  private async withTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  private fromPrisma(row: PrismaOwner): OwnerRecord {
    const address = row.address as Owner["address"];
    const consents = row.consents as unknown as Owner["consents"];
    return { id: row.id, tenantId: row.tenantId, firstName: row.firstName, lastName: row.lastName, phone: row.phone, email: row.email, taxId: row.taxId, address, consents, createdAt: row.createdAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null };
  }
  public nextId(_tenantId: string): string {
    return randomUUID();
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
