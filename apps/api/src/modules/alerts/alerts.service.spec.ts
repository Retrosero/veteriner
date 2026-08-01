/**
 * @file AlertsService unit testleri.
 * @module apps/api/modules/alerts/alerts.service.spec
 * @description Tenant izolasyonu, severity filter, active filtering,
 * archive idempotency, medication conflict match, audit event
 * yayını.
 * @since GOAL-023 (FAZ-2) alerji/kronik uyarılar core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlertsService } from "./alerts.service.js";
import { PatientsRepository } from "../patients/patients.repository.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_B: ActorContext = {
  actorId: "usr-staff-b",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const PATIENT_ID_A = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PATIENT_ID_B = "pat-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/**
 *
 * @param repo
 * @param tenantId
 * @param id
 */
function seedPatient(
  repo: PatientsRepository,
  tenantId: string,
  id: string,
): void {
  repo.insert(
    repo.toRecord(id, tenantId, {
      ownerId: "11111111-1111-1111-1111-111111111111",
      name: "Boncuk",
      species: "dog",
      gender: "male",
      neutered: false,
    }),
  );
}

/**
 *
 */
function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

describe("AlertsService", () => {
  let repo: PatientsRepository;
  let audit: AuditService;
  let service: AlertsService;

  beforeEach(() => {
    repo = new PatientsRepository();
    audit = makeAudit();
    seedPatient(repo, TENANT_A, PATIENT_ID_A);
    seedPatient(repo, TENANT_B, PATIENT_ID_B);
    service = new AlertsService(repo, audit);
    (audit.record as ReturnType<typeof vi.fn>).mockClear();
  });

  describe("add", () => {
    it("başarılı oluşturma (warning → audit yok)", async () => {
      const alert = await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "warning",
          title: "Penisilin alerjisi",
          description:
            "Penisilin grubu antibiyotiklere karşı bilinen reaksiyon.",
        },
        STAFF_A,
      );
      expect(alert.tenantId).toBe(TENANT_A);
      expect(alert.patientId).toBe(PATIENT_ID_A);
      expect(alert.severity).toBe("warning");
      expect(alert.archivedAt).toBeNull();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("critical → audit:alert.create (info) yayınlanır", async () => {
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "critical",
          title: "Anafilaksi",
          description: "Arı sokması → anafilaktik şok.",
        },
        STAFF_A,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:alert.create",
          targetType: "alert",
          action: "create",
          severity: "info",
        }),
      );
    });

    it("cross-tenant patient → 404 VET-AUTHZ-0002", async () => {
      await expect(
        service.add(
          TENANT_A,
          PATIENT_ID_B,
          {
            category: "behavior",
            severity: "info",
            title: "Agresyon",
            description: "Yabancılara agresif.",
          },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 404,
      });
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("listForPatient", () => {
    it("severity filter", async () => {
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        { category: "allergy", severity: "info", title: "A", description: "x" },
        STAFF_A,
      );
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "chronic_condition",
          severity: "critical",
          title: "B",
          description: "y",
        },
        STAFF_A,
      );
      const items = service.listForPatient(TENANT_A, PATIENT_ID_A, STAFF_A, {
        severity: "critical",
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.title).toBe("B");
    });

    it("expired alerts activeOnly=true ile dışlanır", async () => {
      // expired alert (geçmiş tarih)
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "warning",
          title: "Eski alerji",
          description: "Artık geçerli değil.",
          expiresAt: "2000-01-01T00:00:00.000Z",
        },
        STAFF_A,
      );
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "warning",
          title: "Aktif",
          description: "x",
        },
        STAFF_A,
      );
      const items = service.listForPatient(TENANT_A, PATIENT_ID_A, STAFF_A, {
        activeOnly: true,
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.title).toBe("Aktif");
    });

    it("archived kayıtlar activeOnly=true ile dışlanır", async () => {
      const a = await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "behavior",
          severity: "info",
          title: "A",
          description: "x",
        },
        STAFF_A,
      );
      await service.archive(TENANT_A, a.id, STAFF_A);
      const items = service.listForPatient(TENANT_A, PATIENT_ID_A, STAFF_A, {
        activeOnly: true,
      });
      expect(items).toHaveLength(0);
    });

    it("tenant izolasyonu: başka tenant uyarıları görünmez", async () => {
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "info",
          title: "A-tenant-A",
          description: "x",
        },
        STAFF_A,
      );
      await service.add(
        TENANT_B,
        PATIENT_ID_B,
        {
          category: "allergy",
          severity: "info",
          title: "B-tenant-B",
          description: "y",
        },
        STAFF_B,
      );
      const items = service.listForPatient(TENANT_A, PATIENT_ID_A, STAFF_A);
      expect(items).toHaveLength(1);
      expect(items[0]?.title).toBe("A-tenant-A");
    });
  });

  describe("getActiveAlertsForPatient", () => {
    it("critical > warning > info sırası", async () => {
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "info",
          title: "info",
          description: "x",
        },
        STAFF_A,
      );
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "critical",
          title: "critical",
          description: "y",
        },
        STAFF_A,
      );
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "warning",
          title: "warning",
          description: "z",
        },
        STAFF_A,
      );
      const items = service.getActiveAlertsForPatient(
        TENANT_A,
        PATIENT_ID_A,
        STAFF_A,
      );
      expect(items.map((a) => a.severity)).toEqual([
        "critical",
        "warning",
        "info",
      ]);
    });
  });

  describe("archive", () => {
    it("archivedAt set edilir, audit:alert.archive (info) yayınlanır", async () => {
      const a = await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "warning",
          title: "A",
          description: "x",
        },
        STAFF_A,
      );
      (audit.record as ReturnType<typeof vi.fn>).mockClear();
      await service.archive(TENANT_A, a.id, STAFF_A);
      // record tekrar mocklanmış olmalı
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:alert.archive",
          targetType: "alert",
          action: "archive",
          severity: "info",
        }),
      );
      const all = service.listForPatient(TENANT_A, PATIENT_ID_A, STAFF_A);
      expect(all[0]?.archivedAt).not.toBeNull();
    });

    it("idempotent: ikinci kez arşivleme audit yayınlamaz", async () => {
      const a = await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "warning",
          title: "A",
          description: "x",
        },
        STAFF_A,
      );
      await service.archive(TENANT_A, a.id, STAFF_A);
      (audit.record as ReturnType<typeof vi.fn>).mockClear();
      await service.archive(TENANT_A, a.id, STAFF_A);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("checkMedicationConflict", () => {
    it("allergy title'da ilaç adı geçiyorsa eşleşen uyarıyı döner", async () => {
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "critical",
          title: "Penisilin alerjisi",
          description: "Anafilaksi riski.",
        },
        STAFF_A,
      );
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "behavior",
          severity: "info",
          title: "Agresyon",
          description: "Yabancılara agresif.",
        },
        STAFF_A,
      );
      const matches = service.checkMedicationConflict(
        TENANT_A,
        PATIENT_ID_A,
        "Penisilin",
        STAFF_A,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.category).toBe("allergy");
    });

    it("chronic_condition description'da ilaç adı geçiyorsa eşleşir", async () => {
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "chronic_condition",
          severity: "warning",
          title: "Böbrek yetmezliği",
          description: "NSAID kullanımı kontrendike.",
        },
        STAFF_A,
      );
      const matches = service.checkMedicationConflict(
        TENANT_A,
        PATIENT_ID_A,
        "nsaid",
        STAFF_A,
      );
      expect(matches).toHaveLength(1);
    });

    it("eşleşme yoksa boş döner", async () => {
      await service.add(
        TENANT_A,
        PATIENT_ID_A,
        {
          category: "allergy",
          severity: "critical",
          title: "Penisilin alerjisi",
          description: "x",
        },
        STAFF_A,
      );
      const matches = service.checkMedicationConflict(
        TENANT_A,
        PATIENT_ID_A,
        "İbuprofen",
        STAFF_A,
      );
      expect(matches).toHaveLength(0);
    });
  });
});
