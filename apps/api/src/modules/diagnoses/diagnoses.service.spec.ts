/**
 * @file DiagnosesService unit testleri.
 * @module apps/api/modules/diagnoses/diagnoses.service.spec
 *
 * @description Teşhis ekleme, tenant izolasyonu, status state
 * machine (active → resolved/chronic/ruled_out), hasta bazlı
 * problem listesi, soft delete (archive), audit event yayını.
 * DB migration olmadığı için in-memory repo + mock ExaminationsService
 * kullanılır.
 *
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  Diagnosis,
  DiagnosisCreateInput,
  Examination,
} from "@vetniva/contracts";

import type { ExaminationsService } from "../examinations/examinations.service.js";

import { DiagnosesService } from "./diagnoses.service.js";
import { DiagnosesRepository } from "./diagnoses.repository.js";

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

const PATIENT_ID = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXAM_ID_A = "exam-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXAM_ID_B = "exam-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** Mock examination store. */
const examStore = new Map<string, Examination>();
function seedExamination(tenantId: string, id: string, patientId: string): void {
  const e: Examination = {
    id,
    tenantId,
    patientId,
    veterinarianId: "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    appointmentId: null,
    status: "in_progress",
    type: "consultation",
    chiefComplaint: "Kontrol",
    startedAt: "2025-01-01T10:00:00.000Z",
    completedAt: null,
    signedAt: null,
    signedBy: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
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

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function validInput(overrides: Partial<DiagnosisCreateInput> = {}): DiagnosisCreateInput {
  return {
    examinationId: EXAM_ID_A,
    name: "Deri enfeksiyonu",
    category: "primary" as const,
    ...overrides,
  };
}

describe("DiagnosesService", () => {
  let service: DiagnosesService;
  let repo: DiagnosesRepository;
  let examinations: ExaminationsService;
  let audit: AuditService;

  beforeEach(() => {
    examStore.clear();
    seedExamination(TENANT_A, EXAM_ID_A, PATIENT_ID);
    seedExamination(TENANT_B, EXAM_ID_B, PATIENT_ID);
    repo = new DiagnosesRepository();
    examinations = makeExaminations();
    audit = makeAudit();
    service = new DiagnosesService(repo, examinations, audit);
  });

  // -------------------------------------------------------------------------
  // add
  // -------------------------------------------------------------------------

  describe("add", () => {
    it("başarı: status=active + patientId türetilir + audit.create (info)", async () => {
      const d = await service.add(TENANT_A, validInput(), VET_A);
      expect(d.id).toMatch(/^diag-/);
      expect(d.tenantId).toBe(TENANT_A);
      expect(d.examinationId).toBe(EXAM_ID_A);
      expect(d.patientId).toBe(PATIENT_ID);
      expect(d.status).toBe("active");
      expect(d.category).toBe("primary");
      expect(d.code).toBeNull();
      expect(d.notes).toBeNull();
      expect(d.resolvedAt).toBeNull();
      expect(d.createdBy).toBe("usr-vet-a");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:diagnosis.create",
        "diagnosis",
        d.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ status: "active", category: "primary" }),
      );
    });

    it("cross-tenant examination → 404 VET-CLINIC-0001 (audit yazılmaz)", async () => {
      await expect(
        service.add(
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
  // listForExamination
  // -------------------------------------------------------------------------

  describe("listForExamination", () => {
    it("3 teşhis ekle → 3 döner (oluşturma sırasına göre)", async () => {
      await service.add(
        TENANT_A,
        validInput({ name: "Deri enfeksiyonu", category: "primary" }),
        VET_A,
      );
      // Aynı examinationId altında 2 ek kayıt (sıralama için createdAt farklı).
      await new Promise((r) => setTimeout(r, 2));
      await service.add(
        TENANT_A,
        validInput({ name: "Alerji", category: "differential" }),
        VET_A,
      );
      await new Promise((r) => setTimeout(r, 2));
      await service.add(
        TENANT_A,
        validInput({ name: "Parazit", category: "rule_out" }),
        VET_A,
      );

      const list = await service.listForExamination(
        TENANT_A,
        EXAM_ID_A,
        VET_A,
      );
      expect(list).toHaveLength(3);
      expect(list.map((x) => x.name)).toEqual([
        "Deri enfeksiyonu",
        "Alerji",
        "Parazit",
      ]);
    });

    it("arşivlenmiş kayıt listelenmez", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      await service.remove(TENANT_A, a.id, VET_A);
      const list = await service.listForExamination(
        TENANT_A,
        EXAM_ID_A,
        VET_A,
      );
      expect(list).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // listForPatient — status filter
  // -------------------------------------------------------------------------

  describe("listForPatient", () => {
    it("status=active filtresi yalnızca aktif olanları getirir", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      const b = await service.add(
        TENANT_A,
        validInput({ name: "X", category: "secondary" }),
        VET_A,
      );
      // b'yi çözümle.
      await service.resolve(TENANT_A, b.id, VET_A);

      const active = await service.listForPatient(
        TENANT_A,
        PATIENT_ID,
        VET_A,
        { status: "active", includeArchived: false },
      );
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe(a.id);
      expect(active.every((x) => x.status === "active")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // resolve
  // -------------------------------------------------------------------------

  describe("resolve", () => {
    it("status=resolved + resolvedAt set + audit.resolve (info)", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      const r = await service.resolve(TENANT_A, a.id, VET_A);
      expect(r.status).toBe("resolved");
      expect(r.resolvedAt).toBeTruthy();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:diagnosis.resolve",
        "diagnosis",
        a.id,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          after: expect.objectContaining({ status: "resolved" }),
        }),
      );
    });

    it("active değilse → 409 VET-DIAG-0001", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      await service.resolve(TENANT_A, a.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.resolve(TENANT_A, a.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-DIAG-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // setChronic
  // -------------------------------------------------------------------------

  describe("setChronic", () => {
    it("active → chronic + audit.chronic (info)", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const r = await service.setChronic(TENANT_A, a.id, VET_A);
      expect(r.status).toBe("chronic");
      expect(r.resolvedAt).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:diagnosis.chronic",
        "diagnosis",
        a.id,
        "update",
        expect.any(Object),
        "info",
        expect.objectContaining({
          after: expect.objectContaining({ status: "chronic" }),
        }),
      );
    });

    it("active değilse → 409 VET-DIAG-0001", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      await service.resolve(TENANT_A, a.id, VET_A);
      await expect(
        service.setChronic(TENANT_A, a.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-DIAG-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // setRuledOut
  // -------------------------------------------------------------------------

  describe("setRuledOut", () => {
    it("active (differential kategorili) → ruled_out", async () => {
      const a = await service.add(
        TENANT_A,
        validInput({ name: "Dif", category: "differential" }),
        VET_A,
      );
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const r = await service.setRuledOut(TENANT_A, a.id, VET_A);
      expect(r.status).toBe("ruled_out");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:diagnosis.ruled_out",
        "diagnosis",
        a.id,
        "update",
        expect.any(Object),
        "info",
        expect.objectContaining({
          after: expect.objectContaining({ status: "ruled_out" }),
        }),
      );
    });

    it("active → ruled_out (kategori primary)", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      const r = await service.setRuledOut(TENANT_A, a.id, VET_A);
      expect(r.status).toBe("ruled_out");
    });

    it("resolved ise → 409 VET-DIAG-0001", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      await service.resolve(TENANT_A, a.id, VET_A);
      await expect(
        service.setRuledOut(TENANT_A, a.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-DIAG-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------

  describe("remove", () => {
    it("archivedAt set edilir + audit.archive (warning)", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      await service.remove(TENANT_A, a.id, VET_A);

      const rec = repo.findById(TENANT_A, a.id);
      expect(rec?.archivedAt).toBeTruthy();

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:diagnosis.archive",
        "diagnosis",
        a.id,
        "archive",
        expect.any(Object),
        "warning",
        expect.objectContaining({ examinationId: EXAM_ID_A }),
      );
    });

    it("cross-tenant id → 404 VET-CLINIC-0001", async () => {
      const a = await service.add(TENANT_A, validInput(), VET_A);
      await expect(
        service.remove(TENANT_A, a.id, VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
