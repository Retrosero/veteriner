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

import { Injectable, Optional } from "@nestjs/common";
import type { KasaEntryRecord as DbKasa, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import { type KasaEntryRecord } from "../../common/payments/kasa.types.js";
import {
  reversalAmountToScaled,
  scaledBigIntToReversalAmount,
} from "../../common/payments/payment-reversal.types.js";

@Injectable()
export class KasaRepository {
  private readonly byId = new Map<string, KasaEntryRecord>();
  private readonly byTenantAndAccount = new Map<string, Set<string>>();
  private readonly byReference = new Map<string, Set<string>>();
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `ks-${tenantId.slice(0, 8)}-${randomUUID()}`;
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
  public async persist(record: KasaEntryRecord): Promise<KasaEntryRecord> {
    if (!this.prisma) return this.insert(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.kasaEntryRecord.create({
        data: {
          ...record,
          amountSigned: record.amountSigned,
          occurredAt: new Date(record.occurredAt),
        },
      }),
    );
    return this.map(row);
  }
  public async persistedBalance(
    tenantId: string,
    account: KasaEntryRecord["account"],
  ): Promise<string> {
    if (!this.prisma) return this.getBalance(tenantId, account);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.kasaEntryRecord.findMany({
        where: { tenantId, account },
        select: { amountSigned: true },
      }),
    );
    return scaledBigIntToReversalAmount(
      rows.reduce(
        (sum, row) =>
          sum +
          (reversalAmountToScaled(row.amountSigned.toString()) ?? BigInt(0)),
        BigInt(0),
      ),
    );
  }
  public async persistedListForReference(
    tenantId: string,
    referenceType: KasaEntryRecord["referenceType"],
    referenceId: string,
  ): Promise<KasaEntryRecord[]> {
    if (!this.prisma)
      return this.listForReference(tenantId, referenceType, referenceId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.kasaEntryRecord.findMany({
        where: { tenantId, referenceType, referenceId },
        orderBy: { occurredAt: "asc" },
      }),
    );
    return rows.map((row) => this.map(row));
  }
  public async persistedListForSessionRange(
    tenantId: string,
    _branchId: string,
    openedAt: string,
    closedAtOrNow: string,
  ): Promise<KasaEntryRecord[]> {
    if (!this.prisma)
      return this.listForSessionRange(
        tenantId,
        _branchId,
        openedAt,
        closedAtOrNow,
      );
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.kasaEntryRecord.findMany({
        where: {
          tenantId,
          occurredAt: { gte: new Date(openedAt), lte: new Date(closedAtOrNow) },
        },
        orderBy: { occurredAt: "asc" },
      }),
    );
    return rows.map((row) => this.map(row));
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

  /**
   * Tenant'ın belirli bir zaman aralığında gerçekleşen tüm kasa
   * kayıtları. GOAL-074 (FAZ-7) kasa ve gün sonu: bir oturumun
   * açık olduğu zaman aralığı içindeki hareketleri getirir.
   * `branchId` şu an `KasaEntryRecord` üzerinde taşınmaz; bu
   * nedenle parametre olarak alınır ama filtre olarak
   * uygulanmaz — caller session üzerinden daraltma
   * yapabilir. Yine de API yüzeyi ileriye dönük uyumlu
   * tutulur.
   */
  public listForSessionRange(
    tenantId: string,
    _branchId: string,
    openedAt: string,
    closedAtOrNow: string,
  ): KasaEntryRecord[] {
    const out: KasaEntryRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.occurredAt < openedAt) continue;
      if (rec.occurredAt > closedAtOrNow) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
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
  private map(row: DbKasa): KasaEntryRecord {
    return {
      ...row,
      account: row.account as KasaEntryRecord["account"],
      direction: row.direction as KasaEntryRecord["direction"],
      source: row.source as KasaEntryRecord["source"],
      referenceType: row.referenceType as KasaEntryRecord["referenceType"],
      method: row.method as KasaEntryRecord["method"],
      amountSigned: row.amountSigned.toString(),
      occurredAt: row.occurredAt.toISOString(),
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
