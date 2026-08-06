/**
 * @file Consent repository (in-memory).
 * @module apps/api/modules/consents/consents.repository
 *
 * @description GOAL-081 onam formu veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-081 (FAZ-8) onam formları core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { ConsentRecord } from "../../common/consents/consent.types.js";
import type { ConsentRecord as DbConsent, Prisma } from "@prisma/client";
import type {
  ConsentSignatureMethod,
  ConsentStatus,
  ConsentTemplateType,
} from "@vetniva/contracts";

/** Patch tipi. */
export interface ConsentPatch {
  status?: ConsentStatus | undefined;
  signatureMethod?: ConsentSignatureMethod | null | undefined;
  signatureProvider?: string | null | undefined;
  signatureReference?: string | null | undefined;
  signedAt?: string | null | undefined;
  revokedAt?: string | null | undefined;
  revokedBy?: string | null | undefined;
  revokeReason?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface ConsentSearchFilters {
  status?: ConsentStatus | undefined;
  templateType?: ConsentTemplateType | undefined;
  patientId?: string | undefined;
  ownerId?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ConsentsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, ConsentRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `co-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `cs-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ConsentRecord): ConsentRecord {
    this.byId.set(record.id, record);
    return record;
  }
  public async persist(record: ConsentRecord): Promise<ConsentRecord> {
    if (!this.prisma) return this.insert(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.consentRecord.create({
        data: {
          ...record,
          signedAt: record.signedAt ? new Date(record.signedAt) : null,
          revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
        },
      }),
    );
    return this.map(row);
  }
  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<ConsentRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.consentRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    p: ConsentPatch,
  ): Promise<ConsentRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, p);
    const data: Prisma.ConsentRecordUpdateManyMutationInput = {
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.signatureMethod !== undefined
        ? { signatureMethod: p.signatureMethod }
        : {}),
      ...(p.signatureProvider !== undefined
        ? { signatureProvider: p.signatureProvider }
        : {}),
      ...(p.signatureReference !== undefined
        ? { signatureReference: p.signatureReference }
        : {}),
      ...(p.signedAt !== undefined
        ? { signedAt: p.signedAt ? new Date(p.signedAt) : null }
        : {}),
      ...(p.revokedAt !== undefined
        ? { revokedAt: p.revokedAt ? new Date(p.revokedAt) : null }
        : {}),
      ...(p.revokedBy !== undefined ? { revokedBy: p.revokedBy } : {}),
      ...(p.revokeReason !== undefined ? { revokeReason: p.revokeReason } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
    };
    const x = await this.inTenant(tenantId, (tx) =>
      tx.consentRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return x.count ? this.persistedById(tenantId, id) : null;
  }
  public async persistedSearch(
    tenantId: string,
    f: ConsentSearchFilters,
  ): Promise<{ items: ConsentRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, f);
    const where: Prisma.ConsentRecordWhereInput = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.templateType ? { templateType: f.templateType } : {}),
      ...(f.patientId ? { patientId: f.patientId } : {}),
      ...(f.ownerId ? { ownerId: f.ownerId } : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.consentRecord.findMany({
          where,
          orderBy: { createdAt: f.sort ?? "desc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.consentRecord.count({ where }),
      ]);
      return { items: items.map((row) => this.map(row)), total };
    });
  }

  public findById(tenantId: string, id: string): ConsentRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: ConsentPatch,
  ): ConsentRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byId.set(id, rec);
    return rec;
  }

  public search(
    tenantId: string,
    filters: ConsentSearchFilters,
  ): { items: ConsentRecord[]; total: number } {
    const all: ConsentRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.templateType && rec.templateType !== filters.templateType)
        continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.ownerId && rec.ownerId !== filters.ownerId) continue;
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
  private map(row: DbConsent): ConsentRecord {
    return {
      ...row,
      templateType: row.templateType as ConsentRecord["templateType"],
      status: row.status as ConsentRecord["status"],
      signatureMethod: row.signatureMethod as ConsentRecord["signatureMethod"],
      signedAt: row.signedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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
