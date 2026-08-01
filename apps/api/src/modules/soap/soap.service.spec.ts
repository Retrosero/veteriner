/**
 * @file SoapService unit testleri.
 * @module apps/api/modules/soap/soap.service.spec
 *
 * @description SOAP klinik kaydı: create/find/update/sign/amend iş
 * kuralları, tenant izolasyonu, examination cross-service delegation
 * (sign sırasında muayene de imzalanır), audit event yayını.
 * DB migration olmadığı için in-memory repo + mock ExaminationsService
 * kullanılır.
 *
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SoapAmendsRepository,
  SoapNotesRepository,
} from "./soap.repository.js";
import { SoapService } from "./soap.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { ExaminationsService } from "../examinations/examinations.service.js";
import type { Examination } from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const VET_B: ActorContext = {
  actorId: "usr-vet-b",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const EXAM_ID_A = "exam-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXAM_ID_B = "exam-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PATIENT_ID_A = "33333333-3333-3333-3333-333333333333";
const VET_USER_ID_A = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const APPT_ID_A = "appt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Mock examination store. */
const examStore = new Map<string, Examination>();

function makeExam(
  tenantId: string,
  id: string,
  status: "in_progress" | "completed" | "amended" = "in_progress",
): Examination {
  return {
    id,
    tenantId,
    patientId: PATIENT_ID_A,
    veterinarianId: VET_USER_ID_A,
    appointmentId: APPT_ID_A,
    status,
    type: "consultation",
    chiefComplaint: "Halsizlik",
    startedAt: "2025-01-01T10:00:00.000Z",
    completedAt: status === "in_progress" ? null : "2025-01-01T10:30:00.000Z",
    signedAt: null,
    signedBy: null,
    createdAt: "2025-01-01T10:00:00.000Z",
    updatedAt: "2025-01-01T10:00:00.000Z",
  };
}

function seedExam(
  tenantId: string,
  id: string,
  status: "in_progress" | "completed" | "amended" = "in_progress",
): void {
  examStore.set(`${tenantId}|${id}`, makeExam(tenantId, id, status));
}

function makeExaminations(): ExaminationsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          examStore.get(`${tenantId}|${id}`) ?? null,
      ),
    sign: vi.fn().mockImplementation(async (tenantId: string, id: string) => {
      const e = examStore.get(`${tenantId}|${id}`);
      if (!e) throw new Error("exam not found");
      const updated: Examination = {
        ...e,
        signedAt: "2025-01-01T11:00:00.000Z",
        signedBy: "usr-vet-a",
      };
      examStore.set(`${tenantId}|${id}`, updated);
      return updated;
    }),
  } as unknown as ExaminationsService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

describe("SoapService", () => {
  let service: SoapService;
  let repo: SoapNotesRepository;
  let amends: SoapAmendsRepository;
  let examinations: ExaminationsService;
  let audit: AuditService;

  beforeEach(() => {
    examStore.clear();
    seedExam(TENANT_A, EXAM_ID_A, "in_progress");
    seedExam(TENANT_B, EXAM_ID_B, "in_progress");
    repo = new SoapNotesRepository();
    amends = new SoapAmendsRepository();
    examinations = makeExaminations();
    audit = makeAudit();
    service = new SoapService(repo, amends, examinations, audit);
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("başarı: status=draft + audit.create (info)", async () => {
      const soap = await service.create(
        TENANT_A,
        EXAM_ID_A,
        {
          subjective: "İştahsızlık",
          objective: "Ateş 39.5",
          assessment: "Enfeksiyon şüphesi",
          plan: "Antibiyotik başla",
        },
        VET_A,
      );
      expect(soap.id).toMatch(/^soap-/);
      expect(soap.tenantId).toBe(TENANT_A);
      expect(soap.examinationId).toBe(EXAM_ID_A);
      expect(soap.status).toBe("draft");
      expect(soap.subjective).toBe("İştahsızlık");
      expect(soap.signedAt).toBeNull();
      expect(soap.signedBy).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:soap.create",
        "soap",
        soap.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ examinationId: EXAM_ID_A, status: "draft" }),
      );
    });

    it("cross-tenant examination → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.create(TENANT_A, EXAM_ID_B, { subjective: "x" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("examination status≠in_progress (completed) → 409 VET-SOAP-0001", async () => {
      seedExam(TENANT_A, EXAM_ID_A, "completed");
      await expect(
        service.create(TENANT_A, EXAM_ID_A, { subjective: "x" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-SOAP-0001",
        httpStatus: 409,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findByExamination
  // -------------------------------------------------------------------------

  describe("findByExamination", () => {
    it("kendi tenant'ından okur", async () => {
      await service.create(TENANT_A, EXAM_ID_A, { subjective: "x" }, VET_A);
      const found = await service.findByExamination(TENANT_A, EXAM_ID_A, VET_A);
      expect(found?.examinationId).toBe(EXAM_ID_A);
    });

    it("cross-tenant → null", async () => {
      await service.create(TENANT_A, EXAM_ID_A, { subjective: "x" }, VET_A);
      const found = await service.findByExamination(TENANT_B, EXAM_ID_A, VET_B);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe("update", () => {
    it("draft iken güncelleme OK + audit.update (info)", async () => {
      await service.create(TENANT_A, EXAM_ID_A, { subjective: "eski" }, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const updated = await service.update(
        TENANT_A,
        EXAM_ID_A,
        { subjective: "yeni", plan: "kontrol" },
        VET_A,
      );
      expect(updated.subjective).toBe("yeni");
      expect(updated.plan).toBe("kontrol");
      expect(updated.status).toBe("draft");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:soap.update",
        "soap",
        expect.any(String),
        "update",
        expect.any(Object),
        "info",
        expect.objectContaining({ examinationId: EXAM_ID_A }),
      );
    });

    it("signed sonrası update → 409 VET-SOAP-0001", async () => {
      await service.create(TENANT_A, EXAM_ID_A, { subjective: "x" }, VET_A);
      seedExam(TENANT_A, EXAM_ID_A, "completed");
      await service.sign(TENANT_A, EXAM_ID_A, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.update(TENANT_A, EXAM_ID_A, { subjective: "yeni" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-SOAP-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // sign
  // -------------------------------------------------------------------------

  describe("sign", () => {
    it("draft → signed, examination sign tetiklenir + audit.sign (info)", async () => {
      await service.create(
        TENANT_A,
        EXAM_ID_A,
        { subjective: "x", objective: "y", assessment: "z", plan: "w" },
        VET_A,
      );
      seedExam(TENANT_A, EXAM_ID_A, "completed");
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      (examinations.sign as ReturnType<typeof vi.fn>).mockClear();

      const signed = await service.sign(TENANT_A, EXAM_ID_A, VET_A);
      expect(signed.status).toBe("signed");
      expect(signed.signedAt).toBeTruthy();
      expect(signed.signedBy).toBe("usr-vet-a");
      expect(examinations.sign).toHaveBeenCalledWith(
        TENANT_A,
        EXAM_ID_A,
        VET_A,
      );
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:soap.sign",
        "soap",
        expect.any(String),
        "sign",
        expect.any(Object),
        "info",
        expect.objectContaining({ signedBy: "usr-vet-a" }),
      );
    });

    it("signed sonrası tekrar sign → 409 VET-SOAP-0001", async () => {
      await service.create(TENANT_A, EXAM_ID_A, { subjective: "x" }, VET_A);
      seedExam(TENANT_A, EXAM_ID_A, "completed");
      await service.sign(TENANT_A, EXAM_ID_A, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.sign(TENANT_A, EXAM_ID_A, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-SOAP-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // amend
  // -------------------------------------------------------------------------

  describe("amend", () => {
    it("signed → amended, SoapAmend kaydı oluşur + audit.amend (warning)", async () => {
      await service.create(TENANT_A, EXAM_ID_A, { subjective: "x" }, VET_A);
      seedExam(TENANT_A, EXAM_ID_A, "completed");
      await service.sign(TENANT_A, EXAM_ID_A, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      const result = await service.amend(
        TENANT_A,
        EXAM_ID_A,
        {
          reason: "Tanı düzeltme",
          subjective: "Yeni öykü",
          objective: "Yeni bulgu",
          assessment: "Yeni tanı",
          plan: "Yeni plan",
        },
        VET_A,
      );
      expect(result.soap.status).toBe("amended");
      expect(result.amend.id).toMatch(/^soapamend-/);
      expect(result.amend.reason).toBe("Tanı düzeltme");
      expect(result.amend.amendedBy).toBe("usr-vet-a");
      expect(result.amend.previousSignedBy).toBe("usr-vet-a");
      // Orijinal SOAP bölümleri korunmalı (append-only).
      expect(result.amend.subjective).toBe("Yeni öykü");
      expect(result.amend.assessment).toBe("Yeni tanı");

      const list = await service.listAmends(TENANT_A, EXAM_ID_A, VET_A);
      expect(list).toHaveLength(1);

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:soap.amend",
        "soap",
        expect.any(String),
        "amend",
        expect.any(Object),
        "warning",
        expect.objectContaining({ reason: "Tanı düzeltme" }),
      );
    });

    it("draft iken amend → 409 VET-SOAP-0001", async () => {
      await service.create(TENANT_A, EXAM_ID_A, { subjective: "x" }, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.amend(
          TENANT_A,
          EXAM_ID_A,
          {
            reason: "r",
            subjective: "a",
            objective: "b",
            assessment: "c",
            plan: "d",
          },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SOAP-0001",
        httpStatus: 409,
      });
    });
  });
});
