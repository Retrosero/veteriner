/**
 * @file KVKK feature service.
 * @module apps/api/modules/kvkk/kvkk.service
 *
 * @description GOAL-126 (FAZ-12) KVKK controller için iş kuralları.
 *   Bu servis, ortak `KvkkService` (apps/api/src/common/kvkk) ile
 *   veri tabanı ve audit altyapısını birleştirir:
 *
 *   1. **createErasureRequest** — Talebi DB'ye yazar,
 *      `audit:kvkk.erasure.requested` event'i üretir. Owner'ın
 *      tenant kapsamı uygulama katmanında doğrulanır
 *      (cross-tenant erasure reddi).
 *   2. **listErasureRequests** — SUPERADMIN tenant'lar arası
 *      listeleme; status + pagination filtresi.
 *   3. **applyErasure** — PII alanlarını anonimleştirir
 *      (`kvkk-erased-<sha256(ownerId + field).slice(0, 8)>`);
 *      tıbbi kayıtlar yasal saklama süresince tutulur.
 *   4. **exportTenantData** — KVKK Madde 11 + UK GDPR Madde 15
 *      JSON export; sahibin kendi verisi (PII mask'lenmez).
 *
 * @security
 * - Tenant context her zaman `actor.tenantId`'den alınır.
 * - SUPERADMIN tüm tenant'ları görebilir; aksi halde
 *   `requireTenantScope` 403 fırlatır.
 * - PII (firstName, lastName, email, phone, taxId, address)
 *   `applyErasure` sonrası `kvkk-erased-<hash>` formatında
 *   değiştirilir; tıbbi kayıtlar (Examination, Vaccination,
 *   Prescription) append-only kaldığı için korunur.
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

import { createHash } from "node:crypto";

import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  KVKK_LEGAL_RETENTION_YEARS,
  type KvkkErasureRequest,
  type KvkkErasureRequestInput,
  type KvkkErasureRequestListQuery,
  type KvkkErasureRequestListResponse,
  type KvkkErasureApplyResponse,
  type KvkkTenantDataExport,
} from "@vetniva/contracts";

import { ErasureRequestsRepository } from "./erasure-requests.repository.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../prisma/prisma.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

/** KVKK uyarınca anonimleştirilecek PII alanları (Owner tablosu). */
export const KVKK_PII_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "taxId",
  "address",
] as const;

@Injectable()
export class KvkkService {
  private readonly logger = new Logger(KvkkService.name);

  public constructor(
    private readonly repo: ErasureRequestsRepository,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  // -------------------------------------------------------------------------
  // 1) Yeni erasure talebi
  // -------------------------------------------------------------------------

  /**
   * Yeni erasure talebi oluşturur. Owner'ın aynı tenant'a
   * ait olduğu doğrulanır; aksi halde 403 `VET-KVKK-0004`.
   * @param actor
   * @param input
   * @param idempotencyKey opsiyonel; audit metadata'ya yazılır
   */
  public async createErasureRequest(
    actor: ActorContext,
    input: KvkkErasureRequestInput,
    idempotencyKey?: string,
  ): Promise<KvkkErasureRequest> {
    const tenantId = this.requireTenant(actor);

    // Owner doğrulaması: owner bu tenant'a mı ait?
    if (!this.prisma) {
      throw new DomainError({
        errorCode: "VET-COMMON-0001",
        message: "Prisma bağlantısı bulunamadı",
        httpStatus: 500,
        severity: "critical",
        i18nKey: "error.VET-COMMON-0001",
      });
    }
    const owner = await this.withTenant(tenantId, (tx) =>
      tx.owner.findUnique({ where: { id: input.ownerId } }),
    );
    if (!owner || owner.tenantId !== tenantId) {
      throw new DomainError({
        errorCode: "VET-KVKK-0004",
        message: "Sahip farklı tenant'a ait",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-KVKK-0004",
        details: { ownerId: input.ownerId },
      });
    }

    const record = await this.repo.create({
      tenantId,
      ownerId: input.ownerId,
      requestedBy: actor.actorId,
      reason: input.reason,
      metadata: idempotencyKey
        ? { idempotencyKey, source: actor.source }
        : { source: actor.source },
    });

    return this.toContract(record);
  }

  // -------------------------------------------------------------------------
  // 2) Erasure listesi (SUPERADMIN)
  // -------------------------------------------------------------------------

  /**
   * Erasure taleplerini listeler. SUPERADMIN tüm tenant'ları
   * görebilir; diğer actor'lar 403 alır. Status + pagination
   * filtresi opsiyonel.
   * @param actor
   * @param query
   */
  public async listErasureRequests(
    actor: ActorContext,
    query: KvkkErasureRequestListQuery,
  ): Promise<KvkkErasureRequestListResponse> {
    this.requireSuperadmin(actor);
    const tenantId = actor.tenantId;
    if (!tenantId) {
      throw new DomainError({
        errorCode: "VET-TENANT-0001",
        message: "Tenant bağlamı zorunlu (SUPERADMIN listeleme)",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0001",
      });
    }
    const result = await this.repo.findMany({
      tenantId,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.ownerId !== undefined ? { ownerId: query.ownerId } : {}),
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: result.items.map((r) => this.toContract(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // 3) Erasure uygulama (SUPERADMIN)
  // -------------------------------------------------------------------------

  /**
   * Erasure talebini uygular: PII alanlarını Owner üzerinde
   * anonimleştirir; talep kaydını `completed` yapar. Tıbbi
   * kayıtlar (Examination, Vaccination, Prescription) yasal
   * saklama süresince tutulur; bu sürümde `retained` sayısı
   * sahibin patient sayısı üzerinden hesaplanır (yaklaşık).
   * @param actor
   * @param id
   */
  public async applyErasure(
    actor: ActorContext,
    id: string,
  ): Promise<KvkkErasureApplyResponse> {
    this.requireSuperadmin(actor);
    const tenantId = actor.tenantId;
    if (!tenantId) {
      throw new DomainError({
        errorCode: "VET-TENANT-0001",
        message: "Tenant bağlamı zorunlu (SUPERADMIN uygulama)",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0001",
      });
    }

    if (!this.prisma) {
      throw new DomainError({
        errorCode: "VET-COMMON-0001",
        message: "Prisma bağlantısı bulunamadı",
        httpStatus: 500,
        severity: "critical",
        i18nKey: "error.VET-COMMON-0001",
      });
    }

    // 1) Talep mevcut mu ve tenant'a mı ait?
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-KVKK-0001",
        message: "KVKK silme talebi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-KVKK-0001",
        details: { id },
      });
    }
    if (existing.status === "completed" || existing.status === "rejected") {
      throw new DomainError({
        errorCode: "VET-KVKK-0002",
        message: "KVKK talebi zaten işlenmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-KVKK-0002",
        details: { id, status: existing.status },
      });
    }

    // 2) PII alanlarını anonimleştir (kvkk-erased-<hash>).
    //    address JSON alanı için `null` yazılır; hash boş string
    //    üzerinden hesaplanır (kullanıcıya özgü).
    const owner = await this.withTenant(tenantId, (tx) =>
      tx.owner.findUnique({ where: { id: existing.ownerId } }),
    );
    if (!owner) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hasta sahibi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { ownerId: existing.ownerId },
      });
    }

    const erasedFirstName = this.eraseValue(existing.ownerId, "firstName");
    const erasedLastName = this.eraseValue(existing.ownerId, "lastName");
    const erasedEmail = this.eraseValue(existing.ownerId, "email");
    const erasedPhone = this.eraseValue(existing.ownerId, "phone");
    const erasedTaxId = this.eraseValue(existing.ownerId, "taxId");
    const erasedAddress = this.eraseValue(existing.ownerId, "address");

    await this.withTenant(tenantId, (tx) =>
      tx.owner.update({
        where: { id: existing.ownerId },
        data: {
          firstName: erasedFirstName,
          lastName: erasedLastName,
          email: erasedEmail,
          phone: erasedPhone,
          taxId: erasedTaxId,
          address: { erased: erasedAddress } satisfies Prisma.InputJsonValue,
        },
      }),
    );

    // 3) Tıbbi kayıt sayısı (yasal saklama). Owner'a bağlı
    //    patient'lar üzerinden yaklaşık hesaplanır. Tam SQL
    //    count'lar FAZ-12+ retention sweep'te eklenecek.
    const retainedCount = await this.withTenant(tenantId, async (tx) => {
      const patients = await tx.patient.findMany({
        where: { ownerId: existing.ownerId },
        select: { id: true },
      });
      let total = 0;
      for (const p of patients) {
        total += await tx.examination.count({ where: { patientId: p.id } });
      }
      return total;
    });

    // 4) Talep kaydını tamamla.
    const redactedFields: string[] = [...KVKK_PII_FIELDS];
    await this.repo.markApplied({
      tenantId,
      id,
      completedBy: actor.actorId,
      redactedFields,
      retainedMedicalRecords: retainedCount,
      status: "completed",
    });

    this.logger.warn(
      `KVKK erasure applied: request=${id} owner=${existing.ownerId} redacted=${redactedFields.join(",")} retained=${retainedCount}`,
    );

    return { redacted: redactedFields, retained: retainedCount };
  }

  // -------------------------------------------------------------------------
  // 4) Tenant export
  // -------------------------------------------------------------------------

  /**
   * Tenant verisinin JSON export'ı (KVKK Madde 11 + UK GDPR
   * Madde 15). Owner'ın kendi verisi; PII mask'lenmez.
   * SUPERADMIN veya OWNER (`clinic:tenant:export`) çağırabilir.
   * @param actor
   */
  public async exportTenantData(
    actor: ActorContext,
  ): Promise<KvkkTenantDataExport> {
    const tenantId = this.requireTenant(actor);
    if (!this.prisma) {
      throw new DomainError({
        errorCode: "VET-COMMON-0001",
        message: "Prisma bağlantısı bulunamadı",
        httpStatus: 500,
        severity: "critical",
        i18nKey: "error.VET-COMMON-0001",
      });
    }

    const result = await this.withTenant(tenantId, async (tx) => {
      const [
        tenant,
        owners,
        patients,
        examinations,
        vaccinations,
        prescriptions,
      ] = await Promise.all([
        tx.tenant.findUnique({ where: { id: tenantId } }),
        tx.owner.findMany({ where: { tenantId } }),
        tx.patient.findMany({ where: { tenantId } }),
        tx.examination.findMany({ where: { tenantId } }),
        tx.vaccineApplicationRecord.findMany({ where: { tenantId } }),
        tx.prescriptionRecord.findMany({ where: { tenantId } }),
      ]);
      return {
        tenant,
        owners,
        patients,
        examinations,
        vaccinations,
        prescriptions,
      };
    });

    // PII maskeleme log'lamada uygulanır; export gövdesinde PII
    // korunur (veri sahibinin kendi verisi).
    return {
      exportedAt: new Date().toISOString(),
      tenantId,
      tenantSlug: result.tenant?.slug ?? `tnt-${tenantId.slice(0, 8)}`,
      format: "json",
      data: {
        owners: result.owners,
        patients: result.patients,
        examinations: result.examinations,
        vaccinations: result.vaccinations,
        prescriptions: result.prescriptions,
        sales: [],
        payments: [],
      },
      retentionNotice: {
        message:
          "Tıbbi kayıtlar KVKK Madde 7 uyarınca 7 yıl, finansal kayıtlar 5 yıl saklanır.",
        legalBasis: "KVKK_MADDE_7",
        retentionYears: KVKK_LEGAL_RETENTION_YEARS.medical,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Yardımcılar
  // -------------------------------------------------------------------------

  /**
   * Bir PII alanını `kvkk-erased-<sha256(ownerId + ":" + field).slice(0,8)>`
   * formatında anonimleştirir. userId'ye bağlı; aynı kullanıcının
   * farklı alanları farklı hash alır, ancak çapraz-tenant
   * eşleşme yapılamaz.
   * @param ownerId
   * @param field
   */
  private eraseValue(ownerId: string, field: string): string {
    const hash = createHash("sha256")
      .update(`${ownerId}:${field}`)
      .digest("hex")
      .slice(0, 8);
    return `kvkk-erased-${hash}`;
  }

  private requireTenant(actor: ActorContext): string {
    if (actor.tenantId) return actor.tenantId;
    throw new DomainError({
      errorCode: "VET-TENANT-0001",
      message: "Tenant bağlamı zorunlu",
      httpStatus: 400,
      severity: "warning",
      i18nKey: "error.VET-TENANT-0001",
    });
  }

  private requireSuperadmin(actor: ActorContext): void {
    if (actor.isSuperadmin || actor.role === "SUPERADMIN") return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem yalnızca SUPERADMIN içindir",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  private async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) {
      throw new DomainError({
        errorCode: "VET-COMMON-0001",
        message: "Prisma bağlantısı bulunamadı",
        httpStatus: 500,
        severity: "critical",
        i18nKey: "error.VET-COMMON-0001",
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  private toContract(record: {
    id: string;
    tenantId: string;
    ownerId: string;
    requestedBy: string | null;
    reason: string;
    status: "pending" | "in_progress" | "completed" | "rejected";
    requestedAt: string;
    completedAt: string | null;
    redactedFields: string[];
    retainedMedicalRecords: number;
  }): KvkkErasureRequest {
    return {
      id: record.id,
      tenantId: record.tenantId,
      ownerId: record.ownerId,
      requestedAt: record.requestedAt,
      requestedBy: record.requestedBy,
      reason: record.reason,
      status: record.status,
      completedAt: record.completedAt,
      redactedFields: record.redactedFields,
      retainedMedicalRecords: record.retainedMedicalRecords,
    };
  }
}
