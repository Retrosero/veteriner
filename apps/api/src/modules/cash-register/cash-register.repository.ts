/**
 * @file CashRegister (kasa) session repository (in-memory).
 * @module apps/api/modules/cash-register/cash-register.repository
 *
 * @description GOAL-074 (FAZ-7) kasa ve gün sonu. Şube bazlı
 *   oturum (session) kayıtları. DB migration sonraya bırakıldı.
 *   Append-only: hiçbir kayıt fiziksel silinmez; oturumlar
 *   yalnızca `status='reopened'` ile yeniden açılır.
 *
 * İndeksler:
 * - `byId` — `id` → record.
 * - `byTenantAndBranch` — `tenantId|branchId` → Set<sessionId>
 *   (şubeye göre liste).
 * - `openByBranch` — `tenantId|branchId` → Set<sessionId> (yalnızca
 *   status='open' veya 'reopened' olanlar; lookup için).
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-074 (FAZ-7) kasa ve gün sonu core
 */

import { Injectable } from "@nestjs/common";

import type { CashRegisterSessionRecord } from "../../common/cash-register/cash-register.types.js";

@Injectable()
export class CashRegisterRepository {
  private readonly byId = new Map<string, CashRegisterSessionRecord>();
  private readonly byTenantAndBranch = new Map<string, Set<string>>();
  private readonly openByBranch = new Map<string, Set<string>>();
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `crs-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: CashRegisterSessionRecord): CashRegisterSessionRecord {
    this.byId.set(record.id, record);
    this.addToBranchIndex(record);
    if (record.status === "open" || record.status === "reopened") {
      this.addToOpenIndex(record);
    }
    return record;
  }

  public update(record: CashRegisterSessionRecord): CashRegisterSessionRecord {
    // Eski kaydı tüm indekslerden çıkar, yeniden ekle.
    const existing = this.byId.get(record.id);
    if (existing) {
      this.removeFromBranchIndex(existing);
      this.removeFromOpenIndex(existing);
    }
    this.byId.set(record.id, record);
    this.addToBranchIndex(record);
    if (record.status === "open" || record.status === "reopened") {
      this.addToOpenIndex(record);
    }
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): CashRegisterSessionRecord | null {
    const rec = this.byId.get(id);
    if (!rec) return null;
    if (rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Şube için açık oturum (status='open' veya 'reopened').
   * Yalnız bir tane olmalı; birden çok bulunursa en yeni açılan
   * döner (eski kapanmamış olanlar data error kabul edilir ama
   * defensive dönüş yapılır).
   */
  public findOpenForBranch(
    tenantId: string,
    branchId: string,
  ): CashRegisterSessionRecord | null {
    const key = this.openKey(tenantId, branchId);
    const set = this.openByBranch.get(key);
    if (!set || set.size === 0) return null;
    let latest: CashRegisterSessionRecord | null = null;
    for (const id of set.values()) {
      const rec = this.byId.get(id);
      if (!rec) continue;
      if (!latest || rec.openedAt.localeCompare(latest.openedAt) > 0) {
        latest = rec;
      }
    }
    return latest;
  }

  /** Şubenin tüm oturumları (kapalı dahil). */
  public listForBranch(
    tenantId: string,
    branchId: string,
  ): CashRegisterSessionRecord[] {
    const key = this.branchKey(tenantId, branchId);
    const set = this.byTenantAndBranch.get(key);
    if (!set || set.size === 0) return [];
    const out: CashRegisterSessionRecord[] = [];
    for (const id of set.values()) {
      const rec = this.byId.get(id);
      if (rec) out.push(rec);
    }
    return out;
  }

  /** Tenant'ın tüm oturumları (filtresiz). */
  public listAll(tenantId: string): CashRegisterSessionRecord[] {
    const out: CashRegisterSessionRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byTenantAndBranch.clear();
    this.openByBranch.clear();
    this.counters.clear();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private addToBranchIndex(record: CashRegisterSessionRecord): void {
    const key = this.branchKey(record.tenantId, record.branchId);
    let set = this.byTenantAndBranch.get(key);
    if (!set) {
      set = new Set<string>();
      this.byTenantAndBranch.set(key, set);
    }
    set.add(record.id);
  }

  private removeFromBranchIndex(record: CashRegisterSessionRecord): void {
    const key = this.branchKey(record.tenantId, record.branchId);
    const set = this.byTenantAndBranch.get(key);
    if (set) set.delete(record.id);
  }

  private addToOpenIndex(record: CashRegisterSessionRecord): void {
    const key = this.openKey(record.tenantId, record.branchId);
    let set = this.openByBranch.get(key);
    if (!set) {
      set = new Set<string>();
      this.openByBranch.set(key, set);
    }
    set.add(record.id);
  }

  private removeFromOpenIndex(record: CashRegisterSessionRecord): void {
    const key = this.openKey(record.tenantId, record.branchId);
    const set = this.openByBranch.get(key);
    if (set) set.delete(record.id);
  }

  private branchKey(tenantId: string, branchId: string): string {
    return `${tenantId}|${branchId}`;
  }

  private openKey(tenantId: string, branchId: string): string {
    return `${tenantId}|${branchId}`;
  }
}
