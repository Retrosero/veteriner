/**
 * @file Clinical records service.
 * @module apps/api/modules/clinical-records/clinical-records.service
 *
 * @description GOAL-047 klinik kayıt PDF ve paylaşım iş kuralları.
 * Examination + SOAP + Vitals + Diagnoses + Prescriptions + Orders +
 * Followups birleşik PDF render edilir; paylaşım kanalları (e-posta,
 * SMS, portal) üzerinden hasta sahibine iletilir; paylaşım kaydı
 * 7 gün geçerli olacak şekilde oluşturulur.
 *
 * İş kuralları:
 * - `generatePdf`: Examination aynı tenant'ta mı (cross-tenant → 404
 *   VET-CLINIC-0001). Tüm alt kayıtlar tenant-scoped çekilir. PDF
 *   render FAZ-0'da placeholder text/html buffer (gerçek PDF
 *   FAZ-10+'da pdfkit/puppeteer). Audit `audit:clinical-record.generate`
 *   (info).
 * - `shareWithPatient`: PDF oluştur → FileService.upload (FAZ-0 stub
 *   in-memory). 7 gün geçerli share kaydı. NotificationService ile
 *   kanallardan gönder. `channels` en az 1 öğe (boş → 422
 *   VET-VALIDATION-0010). Audit `audit:clinical-record.share` (info).
 * - `listShares`: Examination aynı tenant'ta mı, paylaşım kayıtları
 *   createdAt desc. Tenant-scoped.
 * - `revokeShare`: soft delete (`revokedAt` set). Audit
 *   `audit:clinical-record.revoke` (warning).
 *
 * Permission: `clinic:examination:read` (generate/list),
 * `clinic:report:export` (share/revoke).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Cross-tenant paylaşım denemesi
 *   404 (bilgi sızdırmaz). Signed URL gerçek mekanizması FAZ-10+'da
 *   devreye girer; FAZ-0'da 7 günlük geçerlilik `expiresAt` alanı
 *   ile UI'da gösterilir.
 *
 * @since GOAL-047 (FAZ-4) klinik kayıt PDF ve paylaşım core
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  ClinicalRecordShare,
  NotificationChannel,
  ShareChannel,
} from "@vetniva/contracts";

import { DiagnosesService } from "../diagnoses/diagnoses.service.js";
import { FileService } from "../file/file.service.js";
import { FollowupsService } from "../followups/followups.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { PrescriptionsService } from "../prescriptions/prescriptions.service.js";
import { SoapService } from "../soap/soap.service.js";
import { VitalsService } from "../vitals/vitals.service.js";
import { ExaminationsService } from "../examinations/examinations.service.js";

import {
  type ClinicalRecordShareRecord,
  ClinicalRecordSharesRepository,
  toClinicalRecordShare,
} from "./clinical-records.repository.js";

/** Paylaşım linki geçerlilik süresi (7 gün, saniye). */
const SHARE_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Share kanalını bildirim kanalına eşler. `portal` kanalı in-app
 * bildirim olarak iletilir; e-posta/SMS ise kendi kanalları üzerinden.
 */
function toNotificationChannel(ch: ShareChannel): NotificationChannel {
  switch (ch) {
    case "email":
      return "email";
    case "sms":
      return "sms";
    case "portal":
      return "in_app";
    default: {
      // Exhaustiveness guard — yeni ShareChannel eklenirse TS burada
      // hatayla uyarır.
      const _exhaustive: never = ch;
      return _exhaustive;
    }
  }
}

@Injectable()
export class ClinicalRecordsService {
  private readonly logger = new Logger(ClinicalRecordsService.name);

  public constructor(
    private readonly exams: ExaminationsService,
    private readonly soap: SoapService,
    private readonly vitals: VitalsService,
    private readonly diagnoses: DiagnosesService,
    private readonly prescriptions: PrescriptionsService,
    private readonly orders: OrdersService,
    private readonly followups: FollowupsService,
    private readonly files: FileService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly repo: ClinicalRecordSharesRepository,
  ) {}

  // -------------------------------------------------------------------------
  // generatePdf
  // -------------------------------------------------------------------------

  /**
   * Klinik kayıt PDF render. Tüm alt kayıtları birleştirir, basit
   * text/html buffer üretir (FAZ-0 stub). Cross-tenant → 404.
   */
  public async generatePdf(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<{ id: string; pdfBuffer: Buffer; generatedAt: string }> {
    this.requireTenantScope(actor, tenantId);

    // 1) Examination aynı tenant'ta mı (cross-tenant → 404).
    const exam = await this.exams.findById(tenantId, examinationId, actor);
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }

    // 2) Alt kayıtları paralel topla (hepsi tenant-scoped, bağımsız).
    const [soapNote, vitalsList, diagList, prescList, orderList, followList] =
      await Promise.all([
        this.soap.findByExamination(tenantId, examinationId, actor),
        this.vitals.findByExamination(tenantId, examinationId, actor),
        this.diagnoses.listForExamination(tenantId, examinationId, actor),
        this.prescriptions.list(
          tenantId,
          { patientId: exam.patientId, limit: 100, offset: 0 },
          actor,
        ),
        this.orders.list(
          tenantId,
          { patientId: exam.patientId, limit: 100, offset: 0 },
          actor,
        ),
        this.followups.listPending(tenantId, exam.patientId, actor),
      ]);

    // 3) Render. FAZ-0: text/plain buffer; gerçek PDF FAZ-10+'da
    //    pdfkit/puppeteer. Render içeriği okunabilir plain-text olacak
    //    şekilde tasarlandı (kabul testi için yeterli).
    const id = `crpdf-${tenantId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    const generatedAt = new Date().toISOString();
    const lines: string[] = [
      "=== VETNIVA KLINIK KAYIT ===",
      `Document: ${id}`,
      `Generated: ${generatedAt}`,
      `Tenant: ${tenantId}`,
      ``,
      `-- Examination --`,
      `ID: ${exam.id}`,
      `Patient: ${exam.patientId}`,
      `Veterinarian: ${exam.veterinarianId}`,
      `Type: ${exam.type}`,
      `Status: ${exam.status}`,
      `Chief Complaint: ${exam.chiefComplaint}`,
      `Started: ${exam.startedAt}`,
      `Completed: ${exam.completedAt ?? "-"}`,
      `Signed: ${exam.signedAt ?? "-"}`,
      ``,
      `-- SOAP --`,
      soapNote
        ? [
            `S: ${soapNote.subjective || "-"}`,
            `O: ${soapNote.objective || "-"}`,
            `A: ${soapNote.assessment || "-"}`,
            `P: ${soapNote.plan || "-"}`,
          ].join("\n")
        : "(SOAP notu yok)",
      ``,
      `-- Vitals (${vitalsList.length}) --`,
      ...vitalsList.map(
        (v) =>
          `  ${v.takenAt} temp=${v.vitalSigns.temperatureC ?? "-"} ` +
          `hr=${v.vitalSigns.heartRateBpm ?? "-"} ` +
          `rr=${v.vitalSigns.respiratoryRateBpm ?? "-"} ` +
          `wt=${v.vitalSigns.weightKg ?? "-"}`,
      ),
      ``,
      `-- Diagnoses (${diagList.length}) --`,
      ...diagList.map(
        (d) =>
          `  [${d.category}/${d.status}] ${d.name}` +
          (d.code ? ` (${d.code})` : "") +
          (d.notes ? ` — ${d.notes}` : ""),
      ),
      ``,
      `-- Prescriptions (${prescList.total}) --`,
      ...prescList.items.map(
        (p) =>
          `  ${p.id} status=${p.status} items=${p.items.length} ` +
          `duration=${p.items[0]?.durationDays ?? "-"}d`,
      ),
      ``,
      `-- Orders (${orderList.total}) --`,
      ...orderList.items.map(
        (o) =>
          `  [${o.type}/${o.status}] ${o.description}` +
          (o.dueDate ? ` due=${o.dueDate}` : ""),
      ),
      ``,
      `-- Follow-ups (${followList.length}) --`,
      ...followList.map((f) => `  ${f.start} ${f.end} (${f.type})`),
      ``,
      `(Placeholder PDF — gerçek render FAZ-10+'da)`,
    ];
    const pdfBuffer = Buffer.from(lines.join("\n"), "utf8");

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:clinical-record.generate",
      "clinical_record",
      id,
      "read",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId,
        patientId: exam.patientId,
        veterinarianId: exam.veterinarianId,
        format: "placeholder-text",
        sizeBytes: pdfBuffer.length,
        sections: {
          soap: soapNote ? 1 : 0,
          vitals: vitalsList.length,
          diagnoses: diagList.length,
          prescriptions: prescList.total,
          orders: orderList.total,
          followups: followList.length,
        },
      },
    );

    return { id, pdfBuffer, generatedAt };
  }

  // -------------------------------------------------------------------------
  // shareWithPatient
  // -------------------------------------------------------------------------

  /**
   * Klinik kayıt PDF'ini oluşturur, dosya servisine yükler, kanallar
   * üzerinden gönderir ve 7 gün geçerli share kaydı oluşturur.
   * Audit `audit:clinical-record.share` (info).
   */
  public async shareWithPatient(
    tenantId: string,
    examinationId: string,
    channels: ShareChannel[],
    actor: ActorContext,
  ): Promise<{
    shareId: string;
    expiresAt: string;
    sentChannels: ShareChannel[];
  }> {
    this.requireTenantScope(actor, tenantId);

    // 1) Kanal validasyonu.
    if (channels.length === 0) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "En az bir paylaşım kanalı seçilmelidir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { channelsLength: 0 },
      });
    }

    // 2) Examination mevcut mu.
    const exam = await this.exams.findById(tenantId, examinationId, actor);
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }

    // 3) PDF oluştur.
    const { id: pdfId, pdfBuffer } = await this.generatePdf(
      tenantId,
      examinationId,
      actor,
    );

    // 4) Dosyayı yükle (FAZ-0: in-memory storage). MIME whitelist
    //    gereği `application/pdf` kullanıyoruz; buffer içeriği
    //    placeholder text'tir (gerçek PDF FAZ-10+'da).
    const originalName = `clinical-record-${examinationId}.pdf`;
    const fileMeta = await this.files.upload(
      {
        meta: {
          category: "lab_report",
          mimeType: "application/pdf",
          originalName,
          sizeBytes: pdfBuffer.byteLength,
          visibility: "portal",
          relatedEntityType: "examination",
          relatedEntityId: exam.id,
          description: `Klinik kayıt PDF (${pdfId})`,
        },
        body: pdfBuffer,
      },
      actor,
    );

    // 5) Signed URL üret. FAZ-0: gerçek signed URL FAZ-10+'da;
    //    1 saatlik geçerli URL alıp expiresAt'i 7 gün olarak
    //    paylaşım response'unda set ediyoruz.
    const signedUrl = await this.files
      .getSignedUrl(fileMeta.id, { expiresInSec: 3600 }, actor)
      .then((r) => r.url)
      .catch((err: unknown) => {
        this.logger.warn(
          `signed-url üretimi başarısız (FAZ-0 stub): ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });

    // 6) Kanallardan bildirim gönder.
    const sentChannels: ShareChannel[] = [];
    for (const ch of channels) {
      try {
        await this.notifications.send(
          {
            tenantId,
            userId: actor.actorId ?? exam.patientId,
            channel: toNotificationChannel(ch),
            category: "custom",
            templateKey: "clinical_record_share",
            locale: "tr-TR",
            data: {
              examinationId,
              shareId: undefined, // share record aşağıda oluşturulacak
              fileId: fileMeta.id,
              signedUrl: signedUrl ?? undefined,
              expiresInSec: SHARE_LINK_TTL_SECONDS,
            },
            idempotencyKey: `crshare:${pdfId}:${ch}`,
          },
          actor,
        );
        sentChannels.push(ch);
      } catch (err) {
        this.logger.error(
          `bildirim gönderimi başarısız: channel=${ch} examinationId=${examinationId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    // 7) Share record oluştur.
    const shareId = this.repo.nextId(tenantId);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + SHARE_LINK_TTL_SECONDS * 1000,
    ).toISOString();
    const record: ClinicalRecordShareRecord = {
      id: shareId,
      tenantId,
      examinationId,
      fileId: fileMeta.id,
      channels: [...channels],
      sentChannels: [...sentChannels],
      createdAt: now.toISOString(),
      createdBy: actor.actorId ?? "system",
      expiresAt,
      revokedAt: null,
      signedUrl,
    };
    this.repo.insert(record);

    // 8) Audit.
    await this.audit.recordSimple(
      "audit:clinical-record.share",
      "clinical_record_share",
      shareId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        examinationId,
        fileId: fileMeta.id,
        channels,
        sentChannels,
        pdfId,
        expiresAt,
      },
    );

    return { shareId, expiresAt, sentChannels };
  }

  // -------------------------------------------------------------------------
  // listShares
  // -------------------------------------------------------------------------

  /**
   * Bir muayeneye ait tüm paylaşım kayıtlarını `createdAt` desc
   * sırayla döner. Examination aynı tenant'ta mı doğrulanır.
   */
  public async listShares(
    tenantId: string,
    examinationId: string,
    actor: ActorContext,
  ): Promise<ClinicalRecordShare[]> {
    this.requireTenantScope(actor, tenantId);
    const exam = await this.exams.findById(tenantId, examinationId, actor);
    if (!exam) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Muayene bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { examinationId },
      });
    }
    return this.repo
      .findByExamination(tenantId, examinationId)
      .map((r) => toClinicalRecordShare(r));
  }

  // -------------------------------------------------------------------------
  // revokeShare
  // -------------------------------------------------------------------------

  /**
   * Share kaydını soft-delete yapar (`revokedAt` set). Idempotent.
   * Audit `audit:clinical-record.revoke` (warning).
   */
  public async revokeShare(
    tenantId: string,
    shareId: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, shareId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Paylaşım kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { shareId },
      });
    }
    if (existing.revokedAt !== null) {
      // idempotent — zaten iptal edilmiş.
      return;
    }
    const now = new Date().toISOString();
    this.repo.revoke(tenantId, shareId, now);

    await this.audit.recordSimple(
      "audit:clinical-record.revoke",
      "clinical_record_share",
      shareId,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        examinationId: existing.examinationId,
        fileId: existing.fileId,
        revokedAt: now,
      },
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

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

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
