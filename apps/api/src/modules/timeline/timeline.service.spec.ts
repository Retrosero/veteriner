/**
 * @file TimelineService unit testleri.
 * @module apps/api/modules/timeline/timeline.service.spec
 *
 * @description Birleşik görünüm (alert + transfer), tarih filtresi,
 * tip filtresi, cross-tenant guard, pagination.
 *
 * @since GOAL-024 (FAZ-2) hayvan zaman çizelgesi core (partial)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TimelineService } from "./timeline.service.js";
import {
  AlertTimelineSource,
  OwnershipTimelineSource,
} from "./timeline.sources.js";
import { AlertsService } from "../alerts/alerts.service.js";
import {
  OwnershipHistoryRepository,
  type OwnershipRecord,
} from "../ownership-history/ownership-history.repository.js";
import { PatientsRepository } from "../patients/patients.repository.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { TimelineEventSource } from "../../common/timeline/timeline.types.js";

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

const _STAFF_B: ActorContext = {
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

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function seedOwnership(
  repo: OwnershipHistoryRepository,
  args: {
    id: string;
    patientId: string;
    startDate: string;
    reason: OwnershipRecord["reason"];
    otherNote?: string;
    createdBy?: string | null;
  },
): void {
  const rec: OwnershipRecord = {
    id: args.id,
    tenantId: TENANT_A,
    patientId: args.patientId,
    ownerId: "owner-a",
    startDate: args.startDate,
    endDate: null,
    reason: args.reason,
    otherNote: args.otherNote ?? null,
    createdBy: args.createdBy ?? null,
    createdAt: args.startDate,
  };
  repo.insert(rec);
}

describe("TimelineService", () => {
  let patients: PatientsRepository;
  let alertsService: AlertsService;
  let ownershipRepo: OwnershipHistoryRepository;
  let sources: TimelineEventSource[];
  let service: TimelineService;

  beforeEach(() => {
    patients = new PatientsRepository();
    const audit = makeAudit();
    alertsService = new AlertsService(patients, audit);
    ownershipRepo = new OwnershipHistoryRepository();
    sources = [
      new AlertTimelineSource(alertsService),
      new OwnershipTimelineSource(ownershipRepo),
    ];
    service = new TimelineService(patients, sources);

    seedPatient(patients, TENANT_A, PATIENT_ID_A);
    seedPatient(patients, TENANT_B, PATIENT_ID_B);
  });

  it("alert + transfer event'leri birleşik döner, occurredAt desc sıralı", async () => {
    // 1 alert (eski)
    const oldAlert = await alertsService.add(
      TENANT_A,
      PATIENT_ID_A,
      {
        category: "allergy",
        severity: "warning",
        title: "Penisilin alerjisi",
        description: "Eski kayıt.",
      },
      STAFF_A,
    );
    // Tarihi geriye çek (mockla).
    const oldAlertRec = (
      alertsService as unknown as {
        byId: Map<string, { createdAt: string }>;
      }
    ).byId.get(oldAlert.id);
    if (oldAlertRec) oldAlertRec.createdAt = "2024-01-01T00:00:00.000Z";

    // 1 transfer (yeni) + 1 initial (orta)
    seedOwnership(ownershipRepo, {
      id: "own-init-1",
      patientId: PATIENT_ID_A,
      startDate: "2024-06-01T00:00:00.000Z",
      reason: "initial",
      createdBy: "usr-vet-a",
    });
    seedOwnership(ownershipRepo, {
      id: "own-tx-1",
      patientId: PATIENT_ID_A,
      startDate: "2025-03-15T00:00:00.000Z",
      reason: "transfer",
      createdBy: "usr-vet-a",
    });

    const result = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    );

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    // En yeni → en eski (occurredAt desc).
    expect(result.items[0]?.id).toBe("tln-own-own-tx-1");
    expect(result.items[0]?.type).toBe("transfer");
    expect(result.items[1]?.id).toBe("tln-own-own-init-1");
    expect(result.items[1]?.type).toBe("transfer");
    expect(result.items[2]?.id).toBe(`tln-alert-${oldAlert.id}`);
    expect(result.items[2]?.type).toBe("alert");
  });

  it("from filtresi occurredAt < from olan event'leri dışlar", async () => {
    seedOwnership(ownershipRepo, {
      id: "own-old",
      patientId: PATIENT_ID_A,
      startDate: "2024-01-01T00:00:00.000Z",
      reason: "initial",
      createdBy: "usr-vet-a",
    });
    seedOwnership(ownershipRepo, {
      id: "own-new",
      patientId: PATIENT_ID_A,
      startDate: "2025-01-01T00:00:00.000Z",
      reason: "transfer",
      createdBy: "usr-vet-a",
    });

    const result = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { from: "2024-06-01T00:00:00.000Z", limit: 20, offset: 0 },
      STAFF_A,
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("tln-own-own-new");
  });

  it("to filtresi occurredAt > to olan event'leri dışlar", async () => {
    seedOwnership(ownershipRepo, {
      id: "own-old",
      patientId: PATIENT_ID_A,
      startDate: "2024-01-01T00:00:00.000Z",
      reason: "initial",
      createdBy: "usr-vet-a",
    });
    seedOwnership(ownershipRepo, {
      id: "own-new",
      patientId: PATIENT_ID_A,
      startDate: "2025-01-01T00:00:00.000Z",
      reason: "transfer",
      createdBy: "usr-vet-a",
    });

    const result = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { to: "2024-12-31T23:59:59.000Z", limit: 20, offset: 0 },
      STAFF_A,
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.id).toBe("tln-own-own-old");
  });

  it("types filtresi yalnızca belirtilen tipteki event'leri döner", async () => {
    await alertsService.add(
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
    seedOwnership(ownershipRepo, {
      id: "own-1",
      patientId: PATIENT_ID_A,
      startDate: "2024-06-01T00:00:00.000Z",
      reason: "initial",
      createdBy: "usr-vet-a",
    });

    // Yalnız transfer
    const onlyTransfers = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { types: ["transfer"], limit: 20, offset: 0 },
      STAFF_A,
    );
    expect(onlyTransfers.total).toBe(1);
    expect(onlyTransfers.items[0]?.type).toBe("transfer");

    // Yalnız alert
    const onlyAlerts = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { types: ["alert"], limit: 20, offset: 0 },
      STAFF_A,
    );
    expect(onlyAlerts.total).toBe(1);
    expect(onlyAlerts.items[0]?.type).toBe("alert");
  });

  it("cross-tenant patient → 404", async () => {
    await expect(
      service.listForPatient(
        TENANT_A,
        PATIENT_ID_B, // Tenant B'nin patient'ı
        { limit: 20, offset: 0 },
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      httpStatus: 404,
    });
  });

  it("pagination: limit/offset birleşik set üzerinde uygulanır", async () => {
    // 5 transfer kaydı, farklı tarihlerle
    const base = Date.parse("2025-01-01T00:00:00.000Z");
    for (let i = 0; i < 5; i++) {
      const ts = new Date(base + i * 86_400_000).toISOString();
      seedOwnership(ownershipRepo, {
        id: `own-${i}`,
        patientId: PATIENT_ID_A,
        startDate: ts,
        reason: "transfer",
        createdBy: "usr-vet-a",
      });
    }

    // İlk sayfa: 2 kayıt (en yeni 2)
    const page1 = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { limit: 2, offset: 0 },
      STAFF_A,
    );
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    // En yeni: i=4
    expect(page1.items[0]?.id).toBe("tln-own-own-4");
    expect(page1.items[1]?.id).toBe("tln-own-own-3");

    // İkinci sayfa
    const page2 = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { limit: 2, offset: 2 },
      STAFF_A,
    );
    expect(page2.total).toBe(5);
    expect(page2.items[0]?.id).toBe("tln-own-own-2");
    expect(page2.items[1]?.id).toBe("tln-own-own-1");

    // Son sayfa (kısmi: 1 kayıt)
    const page3 = await service.listForPatient(
      TENANT_A,
      PATIENT_ID_A,
      { limit: 2, offset: 4 },
      STAFF_A,
    );
    expect(page3.total).toBe(5);
    expect(page3.items).toHaveLength(1);
    expect(page3.items[0]?.id).toBe("tln-own-own-0");
  });
});
