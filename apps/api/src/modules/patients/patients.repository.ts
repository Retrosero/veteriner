/**
 * @file Patient repository (in-memory).
 * @module apps/api/modules/patients/patients.repository
 *
 * @description Patient veri erişim katmanı. GOAL-021 kapsamında DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";
import type { Patient as PrismaPatient, Prisma } from "@prisma/client";

import type {
  Patient,
  PatientCreateInput,
} from "../../common/patients/patient.types.js";

/** Persist edilmiş patient record. */
export interface PatientRecord {
  id: string;
  tenantId: string;
  ownerId: string;
  name: string;
  species: Patient["species"];
  breed: string | null;
  birthDate: string | null;
  gender: Patient["gender"];
  microchip: string | null;
  color: string | null;
  neutered: boolean;
  notes: string | null;
  createdAt: string;
  archivedAt: string | null;
}

@Injectable()
export class PatientsRepository {
  /** key: record id → record. */
  private readonly byId = new Map<string, PatientRecord>();
  /**
   * key: tenantId|normalizedMicrochip → record id.
   * Mikroçip opsiyonel; yalnızca set edilen kayıtlar burada yer alır.
   */
  private readonly byMicrochip = new Map<string, string>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  /** Runtime kalıcılığı RLS transaction içinde sağlar; testlerde bellek yolu korunur. */
  public async persist(record: PatientRecord): Promise<PatientRecord> {
    if (!this.prisma) return this.insert(record);
    // Ownership-history gibi henüz DB'ye taşınmamış klinik modülleri aynı
    // request içinde hasta kimliğini bellekten okuyabilmelidir.
    this.insert(record);
    const saved = await this.withTenant(record.tenantId, (tx) => tx.patient.create({ data: {
      id: record.id, tenantId: record.tenantId, ownerId: record.ownerId, name: record.name,
      species: record.species, breed: record.breed, birthDate: record.birthDate ? new Date(`${record.birthDate}T00:00:00.000Z`) : null,
      gender: record.gender, microchip: record.microchip, color: record.color, neutered: record.neutered,
      notes: record.notes, createdAt: new Date(record.createdAt),
    }}));
    return this.fromPrisma(saved);
  }
  public async findPersistedById(tenantId: string, id: string): Promise<PatientRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.withTenant(tenantId, (tx) => tx.patient.findUnique({ where: { id } })); return row ? this.fromPrisma(row) : null;
  }
  public async findPersistedByMicrochip(tenantId: string, microchip: string): Promise<PatientRecord | null> {
    if (!this.prisma) return this.findByMicrochip(tenantId, microchip);
    const row = await this.withTenant(tenantId, (tx) => tx.patient.findFirst({ where: { tenantId, microchip, archivedAt: null } })); return row ? this.fromPrisma(row) : null;
  }
  public async searchPersisted(tenantId: string, args: Parameters<PatientsRepository["search"]>[1]): Promise<{ items: PatientRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, args);
    const term = args.search?.trim(); const where: Prisma.PatientWhereInput = { tenantId, ...(args.includeArchived ? {} : { archivedAt: null }), ...(args.ownerId ? { ownerId: args.ownerId } : {}), ...(args.species ? { species: args.species } : {}), ...(term ? { OR: ["name", "breed", "microchip"].map((field) => ({ [field]: { contains: term, mode: "insensitive" } })) } : {}) };
    const result = await this.withTenant(tenantId, async (tx) => Promise.all([tx.patient.findMany({ where, orderBy: { createdAt: "desc" }, skip: args.offset, take: args.limit }), tx.patient.count({ where })]));
    return { items: result[0].map((row) => this.fromPrisma(row)), total: result[1] };
  }
  public async archivePersisted(tenantId: string, id: string, at: string): Promise<PatientRecord | null> {
    if (!this.prisma) return this.archive(tenantId, id, at);
    const changed = await this.withTenant(tenantId, (tx) => tx.patient.updateMany({ where: { id, tenantId }, data: { archivedAt: new Date(at) } })); return changed.count ? this.findPersistedById(tenantId, id) : null;
  }
  public async updatePersistedOwner(tenantId: string, id: string, ownerId: string): Promise<PatientRecord | null> {
    if (!this.prisma) return this.updateOwner(tenantId, id, ownerId);
    const changed = await this.withTenant(tenantId, (tx) => tx.patient.updateMany({ where: { id, tenantId }, data: { ownerId } })); return changed.count ? this.findPersistedById(tenantId, id) : null;
  }
  private async withTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> { if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı"); return this.prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`; await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`; return fn(tx); }); }
  private fromPrisma(row: PrismaPatient): PatientRecord { return { id: row.id, tenantId: row.tenantId, ownerId: row.ownerId, name: row.name, species: row.species as Patient["species"], breed: row.breed, birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null, gender: row.gender as Patient["gender"], microchip: row.microchip, color: row.color, neutered: row.neutered, notes: row.notes, createdAt: row.createdAt.toISOString(), archivedAt: row.archivedAt?.toISOString() ?? null }; }
  public nextId(_tenantId: string): string {
    return randomUUID();
  }

  public insert(record: PatientRecord): PatientRecord {
    this.byId.set(record.id, record);
    if (record.microchip) {
      this.byMicrochip.set(
        this.microchipKey(record.tenantId, record.microchip),
        record.id,
      );
    }
    return record;
  }

  public findById(tenantId: string, id: string): PatientRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Tenant-scoped mikroçip araması. Arşivlenmiş kayıtlar
   * duplicate kontrolünde YOK sayılır (silinmiş sayılır; aynı
   * mikroçip yeniden kullanılabilir).
   */
  public findByMicrochip(
    tenantId: string,
    microchip: string,
  ): PatientRecord | null {
    const id = this.byMicrochip.get(this.microchipKey(tenantId, microchip));
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId || rec.archivedAt !== null) {
      return null;
    }
    return rec;
  }

  /**
   * Tenant-scoped arama. `search` ad / ırk / mikroçip üzerinde
   * case-insensitive substring match yapar. Arşivlenmiş kayıtlar
   * varsayılan olarak dışlanır.
   */
  public search(
    tenantId: string,
    args: {
      ownerId?: string | undefined;
      species?: Patient["species"] | undefined;
      search?: string | undefined;
      limit: number;
      offset: number;
      includeArchived?: boolean | undefined;
    },
  ): { items: PatientRecord[]; total: number } {
    const needle = args.search?.toLowerCase().trim();

    const all: PatientRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!args.includeArchived && rec.archivedAt !== null) continue;
      if (args.ownerId && rec.ownerId !== args.ownerId) continue;
      if (args.species && rec.species !== args.species) continue;
      if (needle) {
        const hay = [rec.name, rec.breed ?? "", rec.microchip ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    // En yeni kayıt üstte.
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = all.length;
    const items = all.slice(args.offset, args.offset + args.limit);
    return { items, total };
  }

  public archive(
    tenantId: string,
    id: string,
    at: string,
  ): PatientRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    rec.archivedAt = at;
    // Mikroçip index'ten de çıkar: aynı çip yeni kayıtta kullanılabilsin.
    if (rec.microchip) {
      this.byMicrochip.delete(this.microchipKey(rec.tenantId, rec.microchip));
    }
    this.byId.set(id, rec);
    return rec;
  }

  /**
   * Hasta sahibini günceller (kimlik seviyesi). GOAL-022 ownership
   * transfer akışı tarafından çağrılır; klinik/finansal kayıtlar
   * (muayene, aşı, vb.) bu değişiklikten etkilenmez — append-only
   * korunur.
   */
  public updateOwner(
    tenantId: string,
    id: string,
    newOwnerId: string,
  ): PatientRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    rec.ownerId = newOwnerId;
    this.byId.set(id, rec);
    return rec;
  }

  /** Test yardımcısı: tüm veriyi temizler. */
  public clear(): void {
    this.byId.clear();
    this.byMicrochip.clear();
  }

  /** Record oluşturmak için yardımcı (service kullanır). */
  public toRecord(
    id: string,
    tenantId: string,
    input: PatientCreateInput,
  ): PatientRecord {
    return {
      id,
      tenantId,
      ownerId: input.ownerId,
      name: input.name,
      species: input.species,
      breed: input.breed ?? null,
      birthDate: input.birthDate ?? null,
      gender: input.gender,
      microchip: input.microchip ?? null,
      color: input.color ?? null,
      neutered: input.neutered,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      archivedAt: null,
    };
  }

  private microchipKey(tenantId: string, microchip: string): string {
    return `${tenantId}|${microchip}`;
  }
}
