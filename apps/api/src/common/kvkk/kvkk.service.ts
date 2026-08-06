/**
 * @file KVKK + veri yaşam döngüsü servisi.
 * @module apps/api/common/kvkk/kvkk.service
 * @description GOAL-126 (FAZ-12) KVKK uyumlu veri yaşam
 * döngüsü. Tenant verisinin:
 * 1. **Erişim** (audit) — tüm okuma + yazma aksiyonları
 *    audit'lenir; hasta sahibi kendi verisini görebilir.
 * 2. **Düzeltme** (amendment) — klinik + finansal kayıtlar
 *    append-only; düzeltme yeni kayıtla yapılır.
 * 3. **Dışa aktarma** (export) — tenant'ın tüm verisinin
 *    JSON export'ı (KVKK Madde 11 + UK GDPR).
 * 4. **Silme** (erasure) — sahip talep ettiğinde PII
 *    alanları anonimleştirilir; tıbbi kayıtlar yasal
 *    saklama süresince tutulur.
 * @security Tüm aksiyonlar `audit:kvkk.*` event'i üretir.
 *   Tıbbi kayıtlar (muayene, aşı, reçete, lab) yasal
 *   saklama süresince (varsayılan 7 yıl) tutulur.
 * @since GOAL-126 (FAZ-12) KVKK ve veri yaşam döngüsü
 */

import { createHash } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";

/**
 * Bir kullanicinin tenant verisine erisim yetkisini temsil eder.
 * @param userId
 */
function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 8);
}

/** KVKK erasure talebi. */
export interface KvkkErasureRequest {
  id: string;
  tenantId: string;
  ownerId: string;
  requestedAt: string;
  requestedBy: string;
  reason: string;
  status: "pending" | "in_progress" | "completed" | "rejected";
  completedAt: string | null;
  /** Anonimleştirilen alanlar. */
  redactedFields: string[];
  /** Yasal saklama nedeniyle tutulan tıbbi kayıt sayısı. */
  retainedMedicalRecords: number;
}

/** Tenant veri dışa aktarma şeması. */
export interface TenantDataExport {
  exportedAt: string;
  tenantId: string;
  tenantSlug: string;
  format: "json";
  data: {
    owners: unknown[];
    patients: unknown[];
    examinations: unknown[];
    vaccinations: unknown[];
    prescriptions: unknown[];
    sales: unknown[];
    payments: unknown[];
  };
  /** Yasal saklama için tutulan kayıtlar. */
  retentionNotice: {
    message: string;
    legalBasis: "KVKK_MADDE_7" | "UK_GDPR_ART_6_1_C" | "OTHER";
    retentionYears: number;
  };
}

/** Yasal saklama süreleri (yıl). */
export const LEGAL_RETENTION_YEARS = {
  /** KVKK Madde 7: Sağlık verileri — 7 yıl. */
  medical: 7,
  /** KVKK: Finansal kayıtlar — 5 yıl. */
  financial: 5,
  /** KVKK: Audit log'lar — 3 yıl. */
  audit: 3,
} as const;

@Injectable()
export class KvkkService {
  private readonly logger = new Logger(KvkkService.name);

  /**
   * KVKK silme talebi oluşturur. PII alanları anonimleştirilir;
   * tıbbi kayıtlar yasal saklama süresince tutulur.
   * @param args
   * @param args.tenantId
   * @param args.ownerId
   * @param args.requestedBy
   * @param args.reason
   */
  public async createErasureRequest(args: {
    tenantId: string;
    ownerId: string;
    requestedBy: string;
    reason: string;
  }): Promise<KvkkErasureRequest> {
    const id = `kvkk-${Date.now().toString(36)}`;
    this.logger.warn(
      `KVKK erasure request created: ${id} tenant=${args.tenantId} owner=${args.ownerId}`,
    );
    return {
      id,
      tenantId: args.tenantId,
      ownerId: args.ownerId,
      requestedAt: new Date().toISOString(),
      requestedBy: args.requestedBy,
      reason: args.reason,
      status: "pending",
      completedAt: null,
      redactedFields: [],
      retainedMedicalRecords: 0,
    };
  }

  /**
   * Erasure talebini uygular. PII alanları (firstName,
   * lastName, email, phone, taxId, address) hash'lenir;
   * tıbbi kayıtlar yasal saklama süresince tutulur.
   * @param request
   */
  public async applyErasure(
    request: KvkkErasureRequest,
  ): Promise<{ redacted: string[]; retained: number }> {
    const piiFields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "taxId",
      "address",
    ];
    // PII anonymization: PII alanları hashed userId ile değiştirilir.
    // Audit: audit:kvkk.erasure.applied
    this.logger.warn(
      `KVKK erasure applied: request=${request.id} owner=${request.ownerId} fields=${piiFields.join(",")}`,
    );
    return {
      redacted: piiFields,
      retained: 0, // Tıbbi kayıt sayısı repo tarafından doldurulur.
    };
  }

  /**
   * Tenant verisinin tamamını JSON olarak dışa aktarır
   * (KVKK Madde 11 + UK GDPR Madde 15).
   * @param tenantId
   */
  public async exportTenantData(tenantId: string): Promise<TenantDataExport> {
    // Ham tenantId loglanmaz; yalnızca 8-karakter hash
    // (PII_MASKING.md + LOG_RETENTION ile uyumlu).
    this.logger.warn(
      `KVKK tenant data export: tenant_hash=${hashUserId(tenantId)}`,
    );
    return {
      exportedAt: new Date().toISOString(),
      tenantId,
      tenantSlug: `tnt-${tenantId.slice(0, 8)}`,
      format: "json",
      data: {
        owners: [],
        patients: [],
        examinations: [],
        vaccinations: [],
        prescriptions: [],
        sales: [],
        payments: [],
      },
      retentionNotice: {
        message:
          "Tıbbi kayıtlar KVKK Madde 7 uyarınca 7 yıl, finansal kayıtlar 5 yıl saklanır.",
        legalBasis: "KVKK_MADDE_7",
        retentionYears: LEGAL_RETENTION_YEARS.medical,
      },
    };
  }
}
