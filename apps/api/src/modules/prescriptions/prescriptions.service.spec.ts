/**
 * @file PrescriptionsService unit testleri.
 * @module apps/api/modules/prescriptions/prescriptions.service.spec
 *
 * @description Reçete oluşturma, tenant izolasyonu, yaşam döngüsü
 * (active → dispensed / cancelled / expired), dağıtım/iptal
 * audit event yayını, expireOverdue job, PDF placeholder buffer.
 * DB migration olmadığı için in-memory repo + mock
 * ExaminationsService kullanılır.
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrescriptionsRepository } from "./prescriptions.repository.js";
import { PrescriptionsService } from "./prescriptions.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { ClinicalConsumptionService } from "../clinical-consumption/clinical-consumption.service.js";
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
const PATIENT_ID_A = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VET_USER_ID_A = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Mock examination store. */
const examStore = new Map<string, Examination>();

function seedExamination(
  tenantId: string,
  id: string,
  patientId: string,
  veterinarianId: string,
): void {
  const e: Examination = {
    id,
    tenantId,
    patientId,
    veterinarianId,
    appointmentId: "appt-1",
    status: "completed",
    type: "consultation",
    chiefComplaint: "Test",
    startedAt: "2025-01-01T10:00:00.000Z",
    completedAt: "2025-01-01T10:30:00.000Z",
    signedAt: "2025-01-01T10:35:00.000Z",
    signedBy: veterinarianId,
    createdAt: "2025-01-01T10:00:00.000Z",
    updatedAt: "2025-01-01T10:35:00.000Z",
  };
  examStore.set(`${tenantId}|${id}`, e);
}

function makeExaminations(): ExaminationsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          examStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as ExaminationsService;
}

function makeClinicalConsumption(): ClinicalConsumptionService {
  // GOAL-066: reçete dispans anında klinik tüketim oluşturma
  // entegrasyonu için no-op stub. Ürün referanssız items için
  // recordForPrescription çağrılmaz; çağrılırsa null döner.
  return {
    recordForPrescription: vi.fn().mockResolvedValue(null),
  } as unknown as ClinicalConsumptionService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function validItem() {
  return {
    drugName: "Amoksisilin",
    dosage: "50 mg",
    frequency: "twice_daily" as const,
    durationDays: 7,
    route: "oral" as const,
    instructions: "Yemekten sonra",
  };
}

function validInput(
  overrides: Partial<{
    examinationId: string;
    items: ReturnType<typeof validItem>[];
    notes: string;
    durationDays: number;
  }> = {},
) {
  return {
    examinationId: EXAM_ID_A,
    items: [validItem()],
    notes: "Test notes",
    durationDays: 7,
    ...overrides,
  };
}

describe("PrescriptionsService", () => {
  let service: PrescriptionsService;
  let repo: PrescriptionsRepository;
  let examinations: ExaminationsService;
  let clinicalConsumption: ClinicalConsumptionService;
  let audit: AuditService;

  beforeEach(() => {
    examStore.clear();
    seedExamination(TENANT_A, EXAM_ID_A, PATIENT_ID_A, VET_USER_ID_A);
    seedExamination(TENANT_B, EXAM_ID_B, PATIENT_ID_A, VET_USER_ID_A);
    repo = new PrescriptionsRepository();
    examinations = makeExaminations();
    clinicalConsumption = makeClinicalConsumption();
    audit = makeAudit();
    service = new PrescriptionsService(
      repo,
      examinations,
      clinicalConsumption,
      audit,
    );
  });

  afterEach(() => {
    // Her test sonrası sahte zamanlayıcıları sıfırla (güvenlik).
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("başarı: status=active + expiresAt = now + durationDays + audit.create", async () => {
      const before = Date.now();
      const prsc = await service.create(TENANT_A, validInput(), VET_A);
      const after = Date.now();
      expect(prsc.id).toMatch(/^prsc-/);
      expect(prsc.tenantId).toBe(TENANT_A);
      expect(prsc.examinationId).toBe(EXAM_ID_A);
      expect(prsc.patientId).toBe(PATIENT_ID_A);
      expect(prsc.veterinarianId).toBe(VET_USER_ID_A);
      expect(prsc.status).toBe("active");
      expect(prsc.items).toHaveLength(1);
      expect(prsc.dispensedAt).toBeNull();
      expect(prsc.dispensedBy).toBeNull();
      expect(prsc.cancelReason).toBeNull();

      // expiresAt = prescribedAt + 7 gün
      const prescribed = new Date(prsc.prescribedAt).getTime();
      const expires = new Date(prsc.expiresAt).getTime();
      const diffDays = Math.round(
        (expires - prescribed) / (24 * 60 * 60 * 1000),
      );
      expect(diffDays).toBe(7);
      // prescribedAt şimdiki zamana yakın olmalı
      expect(prescribed).toBeGreaterThanOrEqual(before);
      expect(prescribed).toBeLessThanOrEqual(after + 1000);

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:prescription.create",
        "prescription",
        prsc.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          status: "active",
          itemCount: 1,
          durationDays: 7,
        }),
      );
    });

    it("items boş → 422 VET-VALIDATION-0010", async () => {
      await expect(
        service.create(TENANT_A, validInput({ items: [] }), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0010",
        httpStatus: 422,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("durationDays 31 → 422 VET-VALIDATION-0010", async () => {
      await expect(
        service.create(TENANT_A, validInput({ durationDays: 31 }), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0010",
        httpStatus: 422,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("durationDays 0 → 422 VET-VALIDATION-0010", async () => {
      await expect(
        service.create(TENANT_A, validInput({ durationDays: 0 }), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0010",
        httpStatus: 422,
      });
    });

    it("cross-tenant examination → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.create(
          TENANT_A,
          validInput({ examinationId: EXAM_ID_B }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findById — tenant izolasyonu
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("kendi tenant'ından okur", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      const found = await service.findById(TENANT_A, created.id, VET_A);
      expect(found?.id).toBe(created.id);
    });

    it("cross-tenant → null", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      const found = await service.findById(TENANT_B, created.id, VET_B);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe("list", () => {
    it("patientId filtresi", async () => {
      await service.create(TENANT_A, validInput(), VET_A);
      await service.create(TENANT_A, validInput(), VET_A);
      const r = await service.list(
        TENANT_A,
        { patientId: PATIENT_ID_A, limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(2);
      expect(r.items.every((p) => p.patientId === PATIENT_ID_A)).toBe(true);
    });

    it("status filtresi yanlış eşleşme → 0", async () => {
      await service.create(TENANT_A, validInput(), VET_A);
      const r = await service.list(
        TENANT_A,
        { status: "cancelled", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // dispense
  // -------------------------------------------------------------------------

  describe("dispense", () => {
    it("status=dispensed + dispensedAt + dispensedBy + audit.dispense", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const dispensed = await service.dispense(TENANT_A, created.id, VET_A);
      expect(dispensed.status).toBe("dispensed");
      expect(dispensed.dispensedAt).toBeTruthy();
      expect(dispensed.dispensedBy).toBe("usr-vet-a");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:prescription.dispense",
        "prescription",
        created.id,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ dispensedBy: "usr-vet-a" }),
      );
    });

    it("active değilse → 409 VET-PRESC-0003", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      await service.dispense(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.dispense(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-PRESC-0003",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("status=cancelled + cancelReason + audit.cancel (warning)", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const cancelled = await service.cancel(
        TENANT_A,
        created.id,
        { reason: "Hasta vazgeçti" },
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelReason).toBe("Hasta vazgeçti");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:prescription.cancel",
        "prescription",
        created.id,
        "update",
        expect.any(Object),
        "warning",
        expect.objectContaining({ reason: "Hasta vazgeçti" }),
      );
    });

    it("zaten iptal edilmişse → 409 VET-PRESC-0004", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      await service.cancel(TENANT_A, created.id, { reason: "x" }, VET_A);
      await expect(
        service.cancel(TENANT_A, created.id, { reason: "y" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-PRESC-0004",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // expireOverdue
  // -------------------------------------------------------------------------

  describe("expireOverdue", () => {
    it("expiresAt < now olan aktif reçeteler → expired", async () => {
      // 1 gün süreli reçete oluştur
      const created = await service.create(
        TENANT_A,
        validInput({ durationDays: 1 }),
        VET_A,
      );
      // Saati 2 gün ileriye sar (vi.useFakeTimers `new Date()`'i de etkiler)
      const future = new Date(
        new Date(created.prescribedAt).getTime() + 2 * 24 * 60 * 60 * 1000,
      );
      vi.useFakeTimers();
      vi.setSystemTime(future);
      try {
        const count = await service.expireOverdue();
        expect(count).toBe(1);
        const after = await service.findById(TENANT_A, created.id, VET_A);
        expect(after?.status).toBe("expired");
      } finally {
        vi.useRealTimers();
      }
    });

    it("hiç overdue yoksa 0 döner", async () => {
      const count = await service.expireOverdue();
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // pdf
  // -------------------------------------------------------------------------

  describe("pdf", () => {
    it("placeholder text buffer döner + audit.pdf", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const buf = await service.pdf(TENANT_A, created.id, VET_A);
      expect(buf).toBeInstanceOf(Buffer);
      const text = buf.toString("utf8");
      expect(text).toContain(created.id);
      expect(text).toContain("Amoksisilin");
      expect(text).toContain("(Placeholder PDF");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:prescription.pdf",
        "prescription",
        created.id,
        "read",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ format: "placeholder-text" }),
      );
    });

    it("cross-tenant → 404", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      await expect(
        service.pdf(TENANT_B, created.id, VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });
});
