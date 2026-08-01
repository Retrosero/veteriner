/**
 * @file CashRegister (kasa ve gün sonu) service.
 * @module apps/api/modules/cash-register/cash-register.service
 * @description GOAL-074 (FAZ-7) kasa ve gün sonu iş kuralları.
 *
 * Kapsam:
 * - `openSession`: bir şube için yeni kasa oturumu açar.
 *   Şubede zaten açık oturum varsa 409 VET-CASH_REGISTER-0003.
 *   `openingBalance` < 0 → 422 VET-CASH_REGISTER-0002.
 * - `getCurrentOpenSession`: şubenin açık oturumunu döner.
 * - `listSessions`: tenant-scope filtreli liste.
 * - `getSessionDetail`: tek oturum detayı (cross-tenant → null).
 * - `closeSession`: gerçek nakit sayımı → kapanış. Beklenen
 *   bakiye = opening + sum(movements). variance = closing -
 *   expected. status='closed'. Audit audit:cash_register.
 *   session.close (info).
 * - `reopenSession`: kapatılmış oturumu OWNER yetkisi ile
 *   yeniden açar. status='reopened'. originalClosedAt korunur.
 *   Audit audit:cash_register.session.reopen (warning).
 * - `listMovements`: oturuma bağlı tüm kasa hareketleri
 *   (KasaRepository.read). Şu an için: oturumun açık
 *   olduğu zaman aralığı içinde gerçekleşen tüm hareketler.
 * - `getSummary`: kapanış özeti (variance + hesap bazlı kırılım).
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Kapanmış oturumda UPDATE yapılmaz; yalnızca status
 *   değişikliği (`reopened`) append-only tarihçeye yazılır.
 *
 * @since GOAL-074 (FAZ-7) kasa ve gün sonu core
 */

import { Injectable, Logger } from "@nestjs/common";

import { CashRegisterRepository } from "./cash-register.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import {
  cashDecimalToScaled,
  isoDateToUtcEndExclusive,
  isoDateToUtcStart,
  normalizeCashDecimal,
  scaledToCashDecimal,
  toCashRegisterSession,
  type CashRegisterSessionRecord,
} from "../../common/cash-register/cash-register.types.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { KasaRepository } from "../payments/kasa.repository.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { KasaEntryRecord } from "../../common/payments/kasa.types.js";
import type {
  CashRegisterMovement,
  CashRegisterMovementListResponse,
  CashRegisterSession,
  CashRegisterSessionCloseInput,
  CashRegisterSessionFilters,
  CashRegisterSessionListResponse,
  CashRegisterSessionOpenInput,
  CashRegisterSessionReopenInput,
  CashRegisterSessionSummary,
  CashRegisterAccountSummary,
} from "@vetniva/contracts";

@Injectable()
export class CashRegisterService {
  private readonly logger = new Logger(CashRegisterService.name);

  public constructor(
    private readonly repo: CashRegisterRepository,
    private readonly kasa: KasaRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // openSession
  // -------------------------------------------------------------------------

  public async openSession(
    tenantId: string,
    input: CashRegisterSessionOpenInput,
    actor: ActorContext,
  ): Promise<CashRegisterSession> {
    this.requireTenantScope(actor, tenantId);

    // openingBalance validasyonu
    if (!this.isNonNegativeDecimal(input.openingBalance)) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0002",
        message: "Açılış bakiyesi negatif olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0002",
      });
    }
    const openingBalance = normalizeCashDecimal(input.openingBalance);

    // Şubede zaten açık oturum var mı?
    const existing = this.repo.findOpenForBranch(tenantId, input.branchId);
    if (existing) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0003",
        message: "Bu şubede zaten açık bir kasa oturumu var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0003",
        details: { openSessionId: existing.id },
      });
    }

    const now = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: CashRegisterSessionRecord = {
      id,
      tenantId,
      branchId: input.branchId,
      status: "open",
      currency: input.currency ?? "TRY",
      openingBalance,
      closingBalance: null,
      expectedBalance: null,
      variance: null,
      openedAt: now,
      openedBy: this.requireActorId(actor),
      closedAt: null,
      closedBy: null,
      originalClosedAt: null,
      reopenReason: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "cash_register.session.open",
      "cash_register_session",
      id,
      "create",
      {
        actorId: actor.actorId,
        actorType: actor.actorType === "portal_user" ? "user" : actor.actorType,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        correlationId: actor.correlationId,
        country: "TR",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
      },
      "info",
      {
        branchId: input.branchId,
        openingBalance,
        currency: input.currency,
      },
    );

    return toCashRegisterSession(record);
  }

  // -------------------------------------------------------------------------
  // getCurrentOpenSession
  // -------------------------------------------------------------------------

  public async getCurrentOpenSession(
    tenantId: string,
    branchId: string,
    actor: ActorContext,
  ): Promise<CashRegisterSession | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findOpenForBranch(tenantId, branchId);
    if (!rec) return null;
    return toCashRegisterSession(rec);
  }

  // -------------------------------------------------------------------------
  // listSessions
  // -------------------------------------------------------------------------

  public async listSessions(
    tenantId: string,
    filters: CashRegisterSessionFilters,
    actor: ActorContext,
  ): Promise<CashRegisterSessionListResponse> {
    this.requireTenantScope(actor, tenantId);

    let records: CashRegisterSessionRecord[] =
      filters.branchId !== undefined
        ? this.repo.listForBranch(tenantId, filters.branchId)
        : this.repo.listAll(tenantId);

    if (filters.status) {
      records = records.filter((r) => r.status === filters.status);
    }
    if (filters.openedOnDate) {
      const start = isoDateToUtcStart(filters.openedOnDate);
      const end = isoDateToUtcEndExclusive(filters.openedOnDate);
      records = records.filter((r) => r.openedAt >= start && r.openedAt <= end);
    }

    const sort = filters.sort ?? "desc";
    records.sort((a, b) => {
      const cmp = a.openedAt.localeCompare(b.openedAt);
      return sort === "desc" ? -cmp : cmp;
    });

    const total = records.length;
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    const paged = records.slice(offset, offset + limit);
    return {
      items: paged.map(toCashRegisterSession),
      total,
    };
  }

  // -------------------------------------------------------------------------
  // getSessionDetail
  // -------------------------------------------------------------------------

  public async getSessionDetail(
    tenantId: string,
    sessionId: string,
    actor: ActorContext,
  ): Promise<CashRegisterSession | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, sessionId);
    if (!rec) return null;
    return toCashRegisterSession(rec);
  }

  // -------------------------------------------------------------------------
  // closeSession
  // -------------------------------------------------------------------------

  public async closeSession(
    tenantId: string,
    sessionId: string,
    input: CashRegisterSessionCloseInput,
    actor: ActorContext,
  ): Promise<CashRegisterSession> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, sessionId);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0001",
        message: "Kasa oturumu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0001",
      });
    }
    if (rec.status === "closed") {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0004",
        message: "Bu kasa oturumu zaten kapatılmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0004",
      });
    }
    if (!this.isNonNegativeDecimal(input.closingBalance)) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0005",
        message: "Kapanış bakiyesi negatif olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0005",
      });
    }

    // Hareketleri oku (oturumun açık olduğu zaman aralığında).
    const movements = this.listMovementsForRecord(rec);
    const expectedBalance = this.computeExpectedBalance(
      rec.openingBalance,
      movements,
    );
    const closingBalance = normalizeCashDecimal(input.closingBalance);
    const variance = this.subtractDecimals(closingBalance, expectedBalance);

    const now = new Date().toISOString();
    const closed: CashRegisterSessionRecord = {
      ...rec,
      status: "closed",
      closingBalance,
      expectedBalance,
      variance,
      closedAt: now,
      closedBy: this.requireActorId(actor),
      // Reopen sonrası tekrar kapatılırsa originalClosedAt korunur.
      originalClosedAt: rec.originalClosedAt,
      note: input.note ?? rec.note,
      updatedAt: now,
    };
    this.repo.update(closed);

    await this.audit.recordSimple(
      "cash_register.session.close",
      "cash_register_session",
      sessionId,
      "update",
      {
        actorId: actor.actorId,
        actorType: actor.actorType === "portal_user" ? "user" : actor.actorType,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        correlationId: actor.correlationId,
        country: "TR",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
      },
      "info",
      {
        branchId: rec.branchId,
        openingBalance: rec.openingBalance,
        closingBalance,
        expectedBalance,
        variance,
        movementCount: movements.length,
      },
    );

    return toCashRegisterSession(closed);
  }

  // -------------------------------------------------------------------------
  // reopenSession
  // -------------------------------------------------------------------------

  public async reopenSession(
    tenantId: string,
    sessionId: string,
    input: CashRegisterSessionReopenInput,
    actor: ActorContext,
  ): Promise<CashRegisterSession> {
    this.requireTenantScope(actor, tenantId);

    if (actor.role !== "OWNER") {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0006",
        message: "Kasa oturumu yalnızca OWNER tarafından yeniden açılabilir",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0006",
      });
    }

    const rec = this.repo.findById(tenantId, sessionId);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0001",
        message: "Kasa oturumu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0001",
      });
    }
    if (rec.status !== "closed") {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0007",
        message: "Yalnızca kapatılmış oturumlar yeniden açılabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0007",
      });
    }
    // Aynı şubede başka bir açık oturum varsa engelle.
    const otherOpen = this.repo.findOpenForBranch(tenantId, rec.branchId);
    if (otherOpen && otherOpen.id !== rec.id) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0003",
        message: "Bu şubede zaten açık bir kasa oturumu var",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0003",
        details: { openSessionId: otherOpen.id },
      });
    }

    const now = new Date().toISOString();
    const reopened: CashRegisterSessionRecord = {
      ...rec,
      status: "reopened",
      originalClosedAt: rec.originalClosedAt ?? rec.closedAt,
      // Kapanış alanlarını temizle: yeni kapanışta yeniden hesaplanır.
      closingBalance: null,
      expectedBalance: null,
      variance: null,
      closedAt: null,
      closedBy: null,
      reopenReason: input.reason,
      updatedAt: now,
    };
    this.repo.update(reopened);

    await this.audit.recordSimple(
      "cash_register.session.reopen",
      "cash_register_session",
      sessionId,
      "update",
      {
        actorId: actor.actorId,
        actorType: actor.actorType === "portal_user" ? "user" : actor.actorType,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        correlationId: actor.correlationId,
        country: "TR",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
      },
      "warning",
      {
        branchId: rec.branchId,
        reason: input.reason,
        originalClosedAt: rec.originalClosedAt ?? rec.closedAt,
      },
    );

    return toCashRegisterSession(reopened);
  }

  // -------------------------------------------------------------------------
  // listMovements
  // -------------------------------------------------------------------------

  public async listMovements(
    tenantId: string,
    sessionId: string,
    actor: ActorContext,
  ): Promise<CashRegisterMovementListResponse> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, sessionId);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0001",
        message: "Kasa oturumu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0001",
      });
    }
    const movements = this.listMovementsForRecord(rec);
    return {
      items: movements.map((m) => this.toMovementDto(m, rec.id)),
      total: movements.length,
    };
  }

  // -------------------------------------------------------------------------
  // getSummary
  // -------------------------------------------------------------------------

  public async getSummary(
    tenantId: string,
    sessionId: string,
    actor: ActorContext,
  ): Promise<CashRegisterSessionSummary> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, sessionId);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0001",
        message: "Kasa oturumu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0001",
      });
    }
    const movements = this.listMovementsForRecord(rec);
    const accounts = this.aggregateByAccount(movements);
    const expectedBalance = this.computeExpectedBalance(
      rec.openingBalance,
      movements,
    );
    return {
      sessionId: rec.id,
      branchId: rec.branchId,
      status: rec.status,
      currency: rec.currency,
      openingBalance: rec.openingBalance,
      closingBalance: rec.closingBalance,
      expectedBalance,
      variance: rec.variance,
      totalMovementCount: movements.length,
      accounts,
      closedAt: rec.closedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Oturumun açık olduğu zaman aralığında gerçekleşen tüm kasa
   * hareketleri. Zaman aralığı: openedAt → (closedAt ?? Now()).
   * `KasaRepository.listForSessionRange` (GOAL-074) tenant-scoped
   * zaman aralığında entry'leri döner.
   * @param rec
   */
  private listMovementsForRecord(
    rec: CashRegisterSessionRecord,
  ): KasaEntryRecord[] {
    const endTime = rec.closedAt ?? new Date().toISOString();
    return this.kasa.listForSessionRange(
      rec.tenantId,
      rec.branchId,
      rec.openedAt,
      endTime,
    );
  }

  private aggregateByAccount(
    movements: KasaEntryRecord[],
  ): CashRegisterAccountSummary[] {
    const buckets: Record<
      "cash" | "card" | "bank" | "other",
      { credit: bigint; debit: bigint; count: number }
    > = {
      cash: { credit: BigInt(0), debit: BigInt(0), count: 0 },
      card: { credit: BigInt(0), debit: BigInt(0), count: 0 },
      bank: { credit: BigInt(0), debit: BigInt(0), count: 0 },
      other: { credit: BigInt(0), debit: BigInt(0), count: 0 },
    };
    for (const m of movements) {
      // amountSigned işaretli (credit +, debit -). Mutlak değer
      // totalCredit/totalDebit'e; net bakiye direction'a göre
      // hesaplanır.
      const scaled = cashDecimalToScaled(m.amountSigned);
      const abs = scaled < BigInt(0) ? -scaled : scaled;
      const b: {
        credit: bigint;
        debit: bigint;
        count: number;
      } = Reflect.get(buckets, m.account);
      if (m.direction === "credit") {
        b.credit += abs;
      } else {
        b.debit += abs;
      }
      b.count += 1;
    }
    return (
      Object.keys(buckets) as Array<"cash" | "card" | "bank" | "other">
    ).map((account) => {
      const b: {
        credit: bigint;
        debit: bigint;
        count: number;
      } = Reflect.get(buckets, account);
      const net = b.credit - b.debit;
      return {
        account,
        totalCredit: scaledToCashDecimal(b.credit),
        totalDebit: scaledToCashDecimal(b.debit),
        netBalance: scaledToCashDecimal(net),
        movementCount: b.count,
      };
    });
  }

  private computeExpectedBalance(
    openingBalance: string,
    movements: KasaEntryRecord[],
  ): string {
    let total = cashDecimalToScaled(openingBalance);
    for (const m of movements) {
      const scaled = cashDecimalToScaled(m.amountSigned);
      total += scaled;
    }
    return scaledToCashDecimal(total);
  }

  private subtractDecimals(a: string, b: string): string {
    const A = cashDecimalToScaled(a);
    const B = cashDecimalToScaled(b);
    return scaledToCashDecimal(A - B);
  }

  private isNonNegativeDecimal(input: string): boolean {
    if (input === "") return false;
    return /^\d+(\.\d{1,4})?$/.test(input);
  }

  private toMovementDto(
    entry: KasaEntryRecord,
    sessionId: string,
  ): CashRegisterMovement {
    return {
      id: entry.id,
      sessionId,
      tenantId: entry.tenantId,
      account: entry.account,
      amountSigned: entry.amountSigned,
      direction: entry.direction,
      source: entry.source,
      referenceId: entry.referenceId,
      referenceType: entry.referenceType,
      method: entry.method,
      currency: entry.currency,
      occurredAt: entry.occurredAt,
      actorId: entry.actorId,
      note: entry.note,
    };
  }

  private requireActorId(actor: ActorContext): string {
    if (!actor.actorId) {
      throw new DomainError({
        errorCode: "VET-CASH_REGISTER-0008",
        message: "Actor bağlamı zorunlu",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-CASH_REGISTER-0008",
      });
    }
    return actor.actorId;
  }

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }
}
