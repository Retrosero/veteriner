/**
 * @file Kasa (cash register) ledger repository (in-memory).
 * @module apps/api/modules/payments/kasa.repository
 *
 * @description GOAL-073 (FAZ-7) kasa etkisi için in-memory ledger.
 * DB migration sonraya bırakıldı. Append-only: hiçbir kayıt
 * fiziksel silinmez.
 *
 * İndeksler:
 * - `byId` — `id` → record.
 * - `byTenantAndAccount` — `tenantId|account` → Set<entryId>
 *   (hesap bakiyesi hesabı).
 * - `byReference` — `tenantId|referenceType|referenceId` →
 *   Set<entryId> (audit cross-ref).
 * - `counters` — tenantId → sayı.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
 */

import { Injectable } from "@nestjs/common";

import {
  type KasaEntryRecord,
} from "../../common/payments/kasa.types.js";
import { reversalAmountToScaled, scaledBigIntToReversalAmount } from "../../common/payments/payment-reversal.types.js";

@Injectable()
export class KasaRepository {
  private readonly byId = new Map<string, KasaEntryRecord>();
  private readonly byTenantAndAccount = new Map<string, Set<string>>();
  private readonly byReference = new Map<string, Set<string>>();
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `ks-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: KasaEntryRecord): KasaEntryRecord {
    this.byId.set(record.id, record);
    const accountKey = this.accountMapKey(record.tenantId, record.account);
    let set = this.byTenantAndAccount.get(accountKey);
    if (!set) {
      set = new Set<string>();
      this.byTenantAndAccount.set(accountKey, set);
    }
    set.add(record.id);
    const refKey = this.referenceMapKey(
      record.tenantId,
      record.referenceType,
      record.referenceId,
    );
    let set2 = this.byReference.get(refKey);
    if (!set2) {
      set2 = new Set<string>();
      this.byReference.set(refKey, set2);
    }
    set2.add(record.id);
    return record;
  }

  /**
   * Belirli bir hesap için net bakiye (signed: credit +, debit -).
   * Decimal string döner.
   */
  public getBalance(
    tenantId: string,
    account: KasaEntryRecord["account"],
  ): string {
    const key = this.accountMapKey(tenantId, account);
    const set = this.byTenantAndAccount.get(key);
    if (!set || set.size === 0) return "0";
    let total = BigInt(0);
    for (const id of set.values()) {
      const rec = this.byId.get(id);
      if (!rec) continue;
      const scaled = reversalAmountToScaled(rec.amountSigned);
      if (scaled === null) continue;
      total = total + scaled;
    }
    return scaledBigIntToReversalAmount(total);
  }

  /** Belirli bir payment veya reversal'a bağlı tüm kasa kayıtları. */
  public listForReference(
    tenantId: string,
    referenceType: KasaEntryRecord["referenceType"],
    referenceId: string,
  ): KasaEntryRecord[] {
    const key = this.referenceMapKey(tenantId, referenceType, referenceId);
    const set = this.byReference.get(key);
    if (!set || set.size === 0) return [];
    const out: KasaEntryRecord[] = [];
    for (const id of set.values()) {
      const rec = this.byId.get(id);
      if (rec) out.push(rec);
    }
    return out;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byTenantAndAccount.clear();
    this.byReference.clear();
    this.counters.clear();
  }

  private accountMapKey(tenantId: string, account: string): string {
    return `${tenantId}|${account}`;
  }

  private referenceMapKey(
    tenantId: string,
    referenceType: string,
    referenceId: string,
  ): string {
    return `${tenantId}|${referenceType}|${referenceId}`;
  }
}
