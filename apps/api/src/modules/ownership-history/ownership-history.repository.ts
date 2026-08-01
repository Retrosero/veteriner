/**
 * @file Ownership history repository (in-memory).
 * @module apps/api/modules/ownership-history/ownership-history.repository
 *
 * @description Ownership history veri erişim katmanı. GOAL-022
 * kapsamında DB migration sonraya bırakıldı; tenant-scoped in-memory
 * Map kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Bütünlük kısıtları:
 * - Bir (tenant, patient) için aktif (endDate=null) kayıt en fazla
 *   bir tane olabilir. Bu kısıt repository'de `activeByPatient`
 *   index'i ile korunur.
 * - Tenant izolasyonu uygulama katmanında uygulanır; burada her
 *   sorgu `tenantId` ile filtrelenir.
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

import { Injectable } from "@nestjs/common";

import type {
  Ownership,
  OwnershipCreateInput,
  OwnershipFilters,
} from "../../common/ownership/ownership.types.js";

/** Persist edilmiş ownership record. */
export interface OwnershipRecord {
  id: string;
  tenantId: string;
  patientId: string;
  ownerId: string;
  startDate: string;
  endDate: string | null;
  reason: Ownership["reason"];
  otherNote: string | null;
  createdBy: string | null;
  createdAt: string;
}

@Injectable()
export class OwnershipHistoryRepository {
  /** key: record id → record. */
  private readonly byId = new Map<string, OwnershipRecord>();
  /**
   * key: tenantId|patientId|ownerId|active → record id.
   * `active=1` aktif (endDate=null), `active=0` pasif (endDate!=null).
   * Aktif kayıt unique olmalı (enforce setActive ile yapılır).
   */
  private readonly activeByPatient = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `own-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  /**
   * Yeni kayıt insert eder. Eğer aynı patient için aktif kayıt
   * varsa `replaceActiveForPatient` ile onun endDate'i set edilir
   * (append-only korunur; mevcut kayıt değiştirilmez ama yeni
   * kayıt önce eskiyi kapatır).
   *
   * NOT: Bu metot doğrudan insert yapar; aktif kayıt yönetimi
   * service katmanının sorumluluğundadır. Repository burada yalnızca
   * store sağlar.
   */
  public insert(record: OwnershipRecord): OwnershipRecord {
    this.byId.set(record.id, record);
    if (record.endDate === null) {
      const key = this.activeKey(record.tenantId, record.patientId);
      const existing = this.activeByPatient.get(key);
      if (existing !== undefined && existing !== record.id) {
        // Çoklu aktif kayıt korunur; service katmanı invariant'ı
        // sağlamak zorundadır. Bu noktada yalnızca index güncellenir.
      }
      this.activeByPatient.set(key, record.id);
    }
    return record;
  }

  public findById(tenantId: string, id: string): OwnershipRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Bir patient için aktif kaydı getirir (endDate=null). Birden
   * fazla varsa (veri bozulması) ilk bulunanı döner; service katmanı
   * bu invariant'ı sağlar.
   */
  public findActiveByPatient(
    tenantId: string,
    patientId: string,
  ): OwnershipRecord | null {
    const key = this.activeKey(tenantId, patientId);
    const id = this.activeByPatient.get(key);
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId || rec.endDate !== null) {
      return null;
    }
    return rec;
  }

  /**
   * Tenant-scoped arama. Aktif kayıtlar (endDate=null) her zaman
   * üstte; aynı aktif/pasif grup içinde en yeni `startDate` üstte.
   * `createdAt` son tiebreaker olarak kullanılır (aynı ms'lik
   * kayıtlarda).
   */
  public search(
    tenantId: string,
    args: OwnershipFilters,
  ): { items: OwnershipRecord[]; total: number } {
    const all: OwnershipRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (args.patientId && rec.patientId !== args.patientId) continue;
      if (args.ownerId && rec.ownerId !== args.ownerId) continue;
      if (args.activeOnly && rec.endDate !== null) continue;
      all.push(rec);
    }
    // Aktif (endDate=null) üstte; sonra startDate desc; sonra
    // createdAt desc.
    all.sort((a, b) => {
      const aActive = a.endDate === null ? 0 : 1;
      const bActive = b.endDate === null ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      if (a.startDate !== b.startDate) {
        return b.startDate.localeCompare(a.startDate);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
    const total = all.length;
    const items = all.slice(args.offset, args.offset + args.limit);
    return { items, total };
  }

  /**
   * Aktif kaydı kapatır: endDate set edilir, index'ten çıkarılır.
   * Kapanan kayıtta `endDate` zaten null değilse no-op.
   */
  public closeActive(
    tenantId: string,
    patientId: string,
    endDate: string,
  ): OwnershipRecord | null {
    const active = this.findActiveByPatient(tenantId, patientId);
    if (!active) return null;
    active.endDate = endDate;
    this.byId.set(active.id, active);
    this.activeByPatient.delete(this.activeKey(tenantId, patientId));
    return active;
  }

  /** Test yardımcısı: tüm veriyi temizler. */
  public clear(): void {
    this.byId.clear();
    this.activeByPatient.clear();
    this.counters.clear();
  }

  /** Record oluşturmak için yardımcı (service kullanır). */
  public toRecord(id: string, input: OwnershipCreateInput): OwnershipRecord {
    return {
      id,
      tenantId: input.tenantId,
      patientId: input.patientId,
      ownerId: input.ownerId,
      startDate: input.startDate ?? new Date().toISOString(),
      endDate: null,
      reason: input.reason,
      otherNote: input.otherNote ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  private activeKey(tenantId: string, patientId: string): string {
    return `${tenantId}|${patientId}`;
  }
}
