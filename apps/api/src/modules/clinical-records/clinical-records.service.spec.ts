/**
 * @file ClinicalRecordsService unit testleri.
 * @module apps/api/modules/clinical-records/clinical-records.service.spec
 *
 * @description GOAL-047 klinik kayıt PDF ve paylaşım iş kuralları:
 * - `generatePdf` başarı (Buffer döner) + cross-tenant 404.
 * - `shareWithPatient` başarı (shareId + expiresAt) + boş channels 422.
 * - `listShares` muayeneye ait 3 paylaşım.
 * - `revokeShare` soft delete (revokedAt set).
 * - Audit: her public method bir recordSimple event yayınlar.
 *
 * Tüm alt servisler mock'lanır; gerçek PDF render test edilmez
 * (FAZ-0 stub). DB migration olmadığı için in-memory repo kullanılır.
 *
 * @since GOAL-047 (FAZ-4) klinik kayıt PDF ve paylaşım core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Examination } from "@vetniva/contracts";

import type { DiagnosesService } from "../diagnoses/diagnoses.service.js";
import type { ExaminationsService } from "../examinations/examinations.service.js";
import type { FileService } from "../file/file.service.js";
import type { FollowupsService } from "../followups/followups.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { OrdersService } from "../orders/orders.service.js";
import type { PrescriptionsService } from "../prescriptions/prescriptions.service.js";
import type { SoapService } from "../soap/soap.service.js";
import type { VitalsService } from "../vitals/vitals.service.js";

import { ClinicalRecordsService } from "./clinical-records.service.js";
import { ClinicalRecordSharesRepository } from "./clinical-records.repository.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const EXAM_ID = "exam-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PATIENT_ID = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VET_ID = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FILE_ID = "11111111-1111-1111-1111-111111111111";

const VET: ActorContext = {
  actorId: VET_ID,
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-cr-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

/** Farklı tenant'ta çalışan ikinci bir veteriner (cross-tenant 404 senaryosu). */
const VET_B: ActorContext = {
  actorId: "vet-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-cr-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const SUPERADMIN: ActorContext = {
  actorId: "usr-super",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-super",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const examRecord: Examination = {
  id: EXAM_ID,
  tenantId: TENANT_A,
  patientId: PATIENT_ID,
  veterinarianId: VET_ID,
  appointmentId: "appt-1",
  status: "completed",
  type: "consultation",
  chiefComplaint: "Halsizlik",
  startedAt: "2025-01-01T10:00:00.000Z",
  completedAt: "2025-01-01T10:30:00.000Z",
  signedAt: "2025-01-01T10:35:00.000Z",
  signedBy: VET_ID,
  createdAt: "2025-01-01T10:00:00.000Z",
  updatedAt: "2025-01-01T10:35:00.000Z",
};

// ---------------------------------------------------------------------------
// Mock factory'leri
// ---------------------------------------------------------------------------

function makeExams(): ExaminationsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          tenantId === TENANT_A && id === EXAM_ID ? examRecord : null,
      ),
  } as unknown as ExaminationsService;
}

function makeSoap(): SoapService {
  return {
    findByExamination: vi.fn().mockResolvedValue(null),
  } as unknown as SoapService;
}

function makeVitals(): VitalsService {
  return {
    findByExamination: vi.fn().mockResolvedValue([]),
  } as unknown as VitalsService;
}

function makeDiagnoses(): DiagnosesService {
  return {
    listForExamination: vi.fn().mockResolvedValue([]),
  } as unknown as DiagnosesService;
}

function makePrescriptions(): PrescriptionsService {
  return {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  } as unknown as PrescriptionsService;
}

function makeOrders(): OrdersService {
  return {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  } as unknown as OrdersService;
}

function makeFollowups(): FollowupsService {
  return {
    listPending: vi.fn().mockResolvedValue([]),
  } as unknown as FollowupsService;
}

function makeFiles(): FileService {
  return {
    upload: vi.fn().mockResolvedValue({
      id: FILE_ID,
      tenantId: TENANT_A,
      category: "lab_report",
      mimeType: "text/plain",
      originalName: "clinical-record.txt",
      sizeBytes: 1024,
      path: `tenants/${TENANT_A}/files/${FILE_ID}`,
      uploadedBy: VET_ID,
      uploadedAt: new Date().toISOString(),
      archivedAt: null,
      relatedEntityType: "examination",
      relatedEntityId: EXAM_ID,
    }),
    getSignedUrl: vi
      .fn()
      .mockResolvedValue({ url: "https://stub.invalid/signed", expiresInSec: 3600 }),
  } as unknown as FileService;
}

function makeNotifications(): NotificationsService {
  return {
    send: vi.fn().mockResolvedValue({}),
  } as unknown as NotificationsService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({}),
    recordSimple: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("ClinicalRecordsService", () => {
  let service: ClinicalRecordsService;
  let repo: ClinicalRecordSharesRepository;
  let exams: ExaminationsService;
  let soap: SoapService;
  let vitals: VitalsService;
  let diagnoses: DiagnosesService;
  let prescriptions: PrescriptionsService;
  let orders: OrdersService;
  let followups: FollowupsService;
  let files: FileService;
  let notifications: NotificationsService;
  let audit: AuditService;

  beforeEach(() => {
    repo = new ClinicalRecordSharesRepository();
    exams = makeExams();
    soap = makeSoap();
    vitals = makeVitals();
    diagnoses = makeDiagnoses();
    prescriptions = makePrescriptions();
    orders = makeOrders();
    followups = makeFollowups();
    files = makeFiles();
    notifications = makeNotifications();
    audit = makeAudit();
    service = new ClinicalRecordsService(
      exams,
      soap,
      vitals,
      diagnoses,
      prescriptions,
      orders,
      followups,
      files,
      notifications,
      audit,
      repo,
    );
  });

  // -------------------------------------------------------------------------
  // generatePdf
  // -------------------------------------------------------------------------

  describe("generatePdf", () => {
    it("başarı: tenant-scoped, Buffer döner, audit.generate (info)", async () => {
      const result = await service.generatePdf(TENANT_A, EXAM_ID, VET);
      expect(Buffer.isBuffer(result.pdfBuffer)).toBe(true);
      expect(result.pdfBuffer.length).toBeGreaterThan(0);
      expect(result.id).toMatch(/^crpdf-/);
      expect(typeof result.generatedAt).toBe("string");
      // Buffer içeriğinde muayene hasta ID'si yer alır.
      expect(result.pdfBuffer.toString("utf8")).toContain(PATIENT_ID);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinical-record.generate",
        "clinical_record",
        result.id,
        "read",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ examinationId: EXAM_ID }),
      );
    });

    it("cross-tenant examination → 404 VET-CLINIC-0001", async () => {
      // VET_B farklı tenant'ta; o tenant'ta bu exam yok → 404.
      await expect(
        service.generatePdf(TENANT_B, EXAM_ID, VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // shareWithPatient
  // -------------------------------------------------------------------------

  describe("shareWithPatient", () => {
    it("başarı: shareId + expiresAt (7 gün) + sentChannels + audit.share", async () => {
      const before = Date.now();
      const r = await service.shareWithPatient(
        TENANT_A,
        EXAM_ID,
        ["email", "portal"],
        VET,
      );
      expect(r.shareId).toMatch(/^crshare-/);
      expect(r.sentChannels).toEqual(["email", "portal"]);
      // expiresAt ~7 gün sonrası
      const expMs = new Date(r.expiresAt).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(expMs - before).toBeGreaterThan(sevenDaysMs - 5_000);
      expect(expMs - before).toBeLessThan(sevenDaysMs + 5_000);
      // share repo'ya yazıldı
      const stored = repo.findById(TENANT_A, r.shareId);
      expect(stored).not.toBeNull();
      expect(stored?.revokedAt).toBeNull();
      // audit
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinical-record.share",
        "clinical_record_share",
        r.shareId,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ examinationId: EXAM_ID, sentChannels: ["email", "portal"] }),
      );
    });

    it("empty channels → 422 VET-VALIDATION-0010", async () => {
      await expect(
        service.shareWithPatient(TENANT_A, EXAM_ID, [], VET),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0010",
        httpStatus: 422,
      });
      expect(files.upload).not.toHaveBeenCalled();
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listShares
  // -------------------------------------------------------------------------

  describe("listShares", () => {
    it("shareWithPatient sonrası 3 share record döner (createdAt desc)", async () => {
      // 3 paylaşım oluştur; her adımda createdAt'lerin deterministik
      // farklılaşması için kısa bekleme.
      const first = await service.shareWithPatient(
        TENANT_A,
        EXAM_ID,
        ["email"],
        VET,
      );
      await new Promise((r) => setTimeout(r, 5));
      const second = await service.shareWithPatient(
        TENANT_A,
        EXAM_ID,
        ["sms"],
        VET,
      );
      await new Promise((r) => setTimeout(r, 5));
      const third = await service.shareWithPatient(
        TENANT_A,
        EXAM_ID,
        ["portal"],
        VET,
      );

      // Repo üzerinden doğrudan sorgu: 3 kayıt görünür.
      const direct = repo.findByExamination(TENANT_A, EXAM_ID);
      expect(direct).toHaveLength(3);
      // createdAt desc: en yeni (third) üstte, en eski (first) sonda.
      expect(direct[0]?.id).toBe(third.shareId);
      expect(direct[2]?.id).toBe(first.shareId);
      // Ortanca: ikinci oluşturulan.
      expect(direct[1]?.id).toBe(second.shareId);

      // listShares tüm 3 kaydı aynı sırayla döner.
      const list = await service.listShares(TENANT_A, EXAM_ID, VET);
      expect(list).toHaveLength(3);
      expect(list[0]?.id).toBe(third.shareId);
      expect(list[2]?.id).toBe(first.shareId);
      expect(list[0]?.revokedAt).toBeNull();
      expect(list[0]?.sentChannels).toEqual(["portal"]);
    });

    it("boş durumda boş liste döner", async () => {
      const list = await service.listShares(TENANT_A, EXAM_ID, VET);
      expect(list).toHaveLength(0);
    });

    it("cross-tenant examination → 404", async () => {
      // SUPERADMIN ile tenant scope atlanır; exam mock'u tenant A
      // dışındaki sorgu için null döner → service 404 fırlatır.
      await expect(
        service.listShares(TENANT_B, EXAM_ID, SUPERADMIN),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });

  // -------------------------------------------------------------------------
  // revokeShare
  // -------------------------------------------------------------------------

  describe("revokeShare", () => {
    it("soft delete: revokedAt set, audit.revoke (warning)", async () => {
      const id = repo.nextId(TENANT_A);
      repo.insert({
        id,
        tenantId: TENANT_A,
        examinationId: EXAM_ID,
        fileId: FILE_ID,
        channels: ["email"],
        sentChannels: ["email"],
        createdAt: new Date().toISOString(),
        createdBy: VET_ID,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
        signedUrl: null,
      });
      await service.revokeShare(TENANT_A, id, VET);
      const after = repo.findById(TENANT_A, id);
      expect(after?.revokedAt).not.toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:clinical-record.revoke",
        "clinical_record_share",
        id,
        "archive",
        expect.objectContaining({ tenantId: TENANT_A }),
        "warning",
        expect.objectContaining({ examinationId: EXAM_ID }),
      );
    });

    it("idempotent: zaten iptal edilmiş → ek audit yok", async () => {
      const id = repo.nextId(TENANT_A);
      const createdAt = new Date().toISOString();
      repo.insert({
        id,
        tenantId: TENANT_A,
        examinationId: EXAM_ID,
        fileId: FILE_ID,
        channels: ["email"],
        sentChannels: ["email"],
        createdAt,
        createdBy: VET_ID,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
        signedUrl: null,
      });
      await service.revokeShare(TENANT_A, id, VET);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await service.revokeShare(TENANT_A, id, VET);
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("shareId bulunamadı → 404", async () => {
      await expect(
        service.revokeShare(TENANT_A, "crshare-does-not-exist", VET),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });
});
