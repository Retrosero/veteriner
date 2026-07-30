/**
 * @file Owner service.
 * @module apps/api/modules/owners/owners.service
 *
 * @description Owner iş kuralları. KVKK consent, telefon
 * normalizasyonu (E.164), TCKN/VKN doğrulaması, tenant
 * izolasyonu, duplicate kontrolü ve audit event yayını.
 *
 * İş kuralları:
 * - create: KVKK consent zorunlu; telefon E.164 normalize; aynı
 *   tenant'ta aynı telefon → 409; taxId varsa TCKN/VKN algoritmik
 *   doğrulama; audit `audit:owner.create` (info).
 * - findById: tenant izolasyonu, archive edilmiş kayıtlar gizli
 *   sayılmaz (controller'a bırakılır).
 * - search: tenant-scoped, case-insensitive name/phone/email/taxId
 *   araması, pagination.
 * - archive: soft delete (archivedAt), audit `audit:owner.archive`
 *   (warning).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-020 (FAZ-2) hasta sahibi core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { getCountryAdapter } from "../../common/adapters/index.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  Owner,
  OwnerCreateInput,
  OwnerFilters,
} from "../../common/owners/owner.types.js";

import { OwnersRepository, type OwnerRecord } from "./owners.repository.js";

@Injectable()
export class OwnersService {
  private readonly logger = new Logger(OwnersService.name);

  public constructor(
    private readonly repo: OwnersRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni owner oluşturur. KVKK + telefon + taxId doğrulaması,
   * tenant-scoped duplicate kontrolü yapar.
   */
  public async create(
    tenantId: string,
    input: OwnerCreateInput,
    actor: ActorContext,
  ): Promise<Owner> {
    this.requireTenantScope(actor, tenantId);

    if (!input.consentKvkk) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0002",
        message: "KVKK açık rızası zorunludur",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0002",
        details: { field: "consentKvkk" },
      });
    }

    const normalizedPhone = this.normalizeTrPhone(input.phone);
    if (!normalizedPhone) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0003",
        message: "Telefon numarası geçersiz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0003",
        details: { field: "phone" },
      });
    }

    const normalizedTaxId = this.validateAndNormalizeTaxId(input.taxId);

    const dup = this.repo.findByPhone(tenantId, normalizedPhone);
    if (dup) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0002",
        message: "Bu telefon numarası ile kayıtlı hasta sahibi mevcut",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0002",
        details: { tenantId, phone: normalizedPhone },
      });
    }

    const id = this.repo.nextId(tenantId);
    const record = this.repo.toRecord(id, tenantId, input, {
      phone: normalizedPhone,
      taxId: normalizedTaxId,
    });
    this.repo.insert(record);

    await this.audit.record({
      eventName: "audit:owner.create",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "owner",
      targetId: id,
      action: "create",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        firstName: record.firstName,
        lastName: record.lastName,
        phone: record.phone,
        email: record.email,
        taxId: record.taxId,
        consentKvkk: record.consents.kvkk,
        consentMarketing: record.consents.marketing,
      },
      metadata: { source: actor.source },
    });

    return this.toOwner(record);
  }

  /**
   * ID ile getirir. Tenant izolasyonu burada uygulanır;
   * farklı tenant isteği → null (controller 404).
   */
  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Owner | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? this.toOwner(rec) : null;
  }

  /**
   * Tenant-scoped arama. Search ad/soyad/telefon/email/taxId
   * üzerinde case-insensitive substring match yapar.
   */
  public async search(
    tenantId: string,
    filters: OwnerFilters,
    actor: ActorContext,
  ): Promise<{ items: Owner[]; total: number }> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, filters);
    return {
      items: result.items.map((r) => this.toOwner(r)),
      total: result.total,
    };
  }

  /**
   * Owner'ı arşivler (soft delete). PII korunur.
   */
  public async archive(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Owner> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hasta sahibi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    if (existing.archivedAt !== null) {
      // Idempotent: zaten arşivli, mevcut kaydı döndür.
      return this.toOwner(existing);
    }
    const at = new Date().toISOString();
    const archived = this.repo.archive(tenantId, id, at);
    if (!archived) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hasta sahibi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }

    await this.audit.record({
      eventName: "audit:owner.archive",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "owner",
      targetId: id,
      action: "archive",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { archivedAt: null },
      after: { archivedAt: at },
      metadata: { source: actor.source },
    });

    return this.toOwner(archived);
  }

  /**
   * Türkiye telefonunu E.164 (+90XXXXXXXXXX) formatına normalize eder.
   * `05321234567`, `5321234567`, `+905321234567` gibi girişleri kabul
   * eder. Geçersiz uzunluk/format → null.
   */
  private normalizeTrPhone(raw: string): string | null {
    const cleaned = raw.replace(/[\s\-()]/g, "");
    let digits: string;
    if (cleaned.startsWith("+90")) {
      digits = cleaned.slice(3);
    } else if (cleaned.startsWith("+")) {
      return null; // TR dışı prefix, pilot kapsamı dışı
    } else if (cleaned.startsWith("0")) {
      digits = cleaned.slice(1);
    } else {
      digits = cleaned;
    }
    if (!/^\d{10}$/.test(digits)) return null;
    if (!digits.startsWith("5")) return null; // TR mobil 5XX ile başlar
    return `+90${digits}`;
  }

  /**
   * TCKN (11 hane) veya VKN (10 hane) doğrulaması yapar; geçerli ise
   * normalize edilmiş halini, değilse hata fırlatır. taxId yoksa
   * null döner.
   */
  private validateAndNormalizeTaxId(taxId: string | undefined): string | null {
    if (!taxId) return null;
    const cleaned = taxId.replace(/\s/g, "");
    const adapter = getCountryAdapter("TR");
    const kind: "personal" | "company" =
      cleaned.length === 10 ? "company" : "personal";
    const result = adapter.validateTaxId(cleaned, kind);
    if (!result.valid || !result.normalized) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0006",
        message: "TCKN/VKN geçersiz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0006",
        details: { field: "taxId", kind },
      });
    }
    return result.normalized;
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

  private toOwner(rec: OwnerRecord): Owner {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      firstName: rec.firstName,
      lastName: rec.lastName,
      phone: rec.phone,
      email: rec.email,
      taxId: rec.taxId,
      address: rec.address,
      consents: rec.consents,
      createdAt: rec.createdAt,
      archivedAt: rec.archivedAt,
    };
  }
}
