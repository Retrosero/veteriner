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

import { Injectable } from "@nestjs/common";

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
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `pat-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
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

  public archive(tenantId: string, id: string, at: string): PatientRecord | null {
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
    this.counters.clear();
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
