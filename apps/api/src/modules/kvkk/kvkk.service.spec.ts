/**
 * @file KVKK service unit testleri.
 * @module apps/api/modules/kvkk/kvkk.service.spec
 *
 * @description GOAL-126 (FAZ-12) KVKK controller + endpoint
 *   servisinin temel davranışlarını doğrular.
 *
 *   Kapsam:
 *   1. createErasureRequest — owner tenant scope, DB yazımı,
 *      audit metadata.
 *   2. listErasureRequests — SUPERADMIN filtresi, pagination.
 *   3. applyErasure — PII anonymization, 404/409, status update.
 *   4. exportTenantData — JSON format + retention notice.
 *   5. cross-tenant erasure reddi.
 *
 *   Test verisi kimliksizdir; PII loglanmaz.
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { KvkkService } from "./kvkk.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type {
  ErasureRequestsRepository,
  ErasureRequestRecord,
} from "./erasure-requests.repository.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OWNER_A = "own-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER_B = "own-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const OWNER_ACTOR: ActorContext = {
  actorId: "usr-owner-1",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const SUPERADMIN_ACTOR: ActorContext = {
  actorId: "usr-sa-1",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_ACTOR: ActorContext = {
  actorId: "usr-staff-1",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function asString(value: unknown): string {
  return typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : String(value);
}

function makeRecord(
  overrides: Partial<ErasureRequestRecord>,
): ErasureRequestRecord {
  return {
    id: "kvkk-test-id",
    tenantId: TENANT_A,
    ownerId: OWNER_A,
    requestedBy: "usr-owner-1",
    reason: "Sahip talebi",
    status: "pending",
    requestedAt: "2026-08-05T12:00:00.000Z",
    completedAt: null,
    completedBy: null,
    redactedFields: [],
    retainedMedicalRecords: 0,
    ...overrides,
  };
}

interface TxMock {
  $executeRaw: ReturnType<typeof vi.fn>;
  owner: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  patient: {
    findMany: ReturnType<typeof vi.fn>;
  };
  examination: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  vaccineApplicationRecord: {
    findMany: ReturnType<typeof vi.fn>;
  };
  prescriptionRecord: {
    findMany: ReturnType<typeof vi.fn>;
  };
  tenant: {
    findUnique: ReturnType<typeof vi.fn>;
  };
}

interface ServiceHarness {
  service: KvkkService;
  repo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    markApplied: ReturnType<typeof vi.fn>;
  };
  prisma: {
    $transaction: ReturnType<typeof vi.fn>;
  };
  tx: TxMock;
  logSpy: ReturnType<typeof vi.spyOn>;
}

function createHarness(): ServiceHarness {
  const tx: TxMock = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    owner: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    patient: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    examination: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    vaccineApplicationRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    prescriptionRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
        id: TENANT_A,
        slug: "pilot-vet",
      }),
    },
  };
  const $transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: TxMock) => Promise<unknown>) => fn(tx));
  const prisma = { $transaction } as unknown as PrismaService;

  const repo = {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    markApplied: vi.fn(),
  } as unknown as ErasureRequestsRepository;

  const service = new KvkkService(repo, prisma);
  const logSpy = vi
    .spyOn(service["logger"], "warn")
    .mockImplementation(() => undefined);

  return {
    service,
    repo: repo as unknown as ServiceHarness["repo"],
    prisma: { $transaction },
    tx,
    logSpy,
  };
}

describe("KvkkService", () => {
  let harness: ServiceHarness;
  beforeEach(() => {
    harness = createHarness();
  });

  describe("createErasureRequest", () => {
    it("tenant'a ait owner için pending talep oluşturur", async () => {
      harness.tx.owner.findUnique.mockResolvedValue({
        id: OWNER_A,
        tenantId: TENANT_A,
      });
      harness.repo.create.mockResolvedValue(makeRecord({ status: "pending" }));

      const result = await harness.service.createErasureRequest(OWNER_ACTOR, {
        ownerId: OWNER_A,
        reason: "Sahip talebi test",
      });

      expect(result.status).toBe("pending");
      expect(result.tenantId).toBe(TENANT_A);
      expect(result.ownerId).toBe(OWNER_A);
      expect(harness.repo.create).toHaveBeenCalledTimes(1);
    });

    it("farklı tenant'a ait owner için 403 VET-KVKK-0004 fırlatır", async () => {
      harness.tx.owner.findUnique.mockResolvedValue({
        id: OWNER_B,
        tenantId: TENANT_B,
      });

      await expect(
        harness.service.createErasureRequest(OWNER_ACTOR, {
          ownerId: OWNER_B,
          reason: "Cross-tenant test",
        }),
      ).rejects.toMatchObject({
        errorCode: "VET-KVKK-0004",
        httpStatus: 403,
      });
      expect(harness.repo.create).not.toHaveBeenCalled();
    });

    it("bulunmayan owner için 403 VET-KVKK-0004 fırlatır (bilgi sızdırmaz)", async () => {
      harness.tx.owner.findUnique.mockResolvedValue(null);
      await expect(
        harness.service.createErasureRequest(OWNER_ACTOR, {
          ownerId: OWNER_A,
          reason: "Olmayan sahip test",
        }),
      ).rejects.toMatchObject({ errorCode: "VET-KVKK-0004" });
    });

    it("idempotencyKey metadata'da saklanır", async () => {
      harness.tx.owner.findUnique.mockResolvedValue({
        id: OWNER_A,
        tenantId: TENANT_A,
      });
      harness.repo.create.mockResolvedValue(makeRecord({ status: "pending" }));
      await harness.service.createErasureRequest(
        OWNER_ACTOR,
        { ownerId: OWNER_A, reason: "Sahip talebi test" },
        "idem-key-1",
      );
      expect(harness.repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            idempotencyKey: "idem-key-1",
          }),
        }),
      );
    });

    it("actor.tenantId yoksa 400 VET-TENANT-0001 fırlatır", async () => {
      const noTenantActor: ActorContext = {
        ...STAFF_ACTOR,
        tenantId: null,
        isSuperadmin: false,
      };
      await expect(
        harness.service.createErasureRequest(noTenantActor, {
          ownerId: OWNER_A,
          reason: "Tenant yok test",
        }),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });

  describe("listErasureRequests", () => {
    it("SUPERADMIN için filtreli liste döner", async () => {
      harness.repo.findMany.mockResolvedValue({
        items: [makeRecord({ status: "pending" })],
        total: 1,
      });
      const result = await harness.service.listErasureRequests(
        SUPERADMIN_ACTOR,
        { status: "pending", limit: 20, offset: 0 },
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(harness.repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending" }),
      );
    });

    it("SUPERADMIN olmayan actor 403 alır", async () => {
      await expect(
        harness.service.listErasureRequests(OWNER_ACTOR, {
          limit: 20,
          offset: 0,
        }),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
      expect(harness.repo.findMany).not.toHaveBeenCalled();
    });
  });

  describe("applyErasure", () => {
    it("mevcut pending talep için 6 PII alanı + retained sayısı döner", async () => {
      harness.repo.findById.mockResolvedValue(
        makeRecord({ status: "pending", ownerId: OWNER_A }),
      );
      harness.tx.owner.findUnique.mockResolvedValue({
        id: OWNER_A,
        tenantId: TENANT_A,
      });
      harness.repo.markApplied.mockImplementation(
        async (args: {
          redactedFields: string[];
          retainedMedicalRecords: number;
        }) =>
          makeRecord({
            id: "kvkk-test-id",
            status: "completed",
            redactedFields: args.redactedFields,
            retainedMedicalRecords: args.retainedMedicalRecords,
            completedAt: "2026-08-05T12:30:00.000Z",
          }),
      );

      const result = await harness.service.applyErasure(
        SUPERADMIN_ACTOR,
        "kvkk-test-id",
      );
      expect(result.redacted).toEqual([
        "firstName",
        "lastName",
        "email",
        "phone",
        "taxId",
        "address",
      ]);
      expect(result.retained).toBe(0);
      expect(harness.repo.markApplied).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      );
    });

    it("talep bulunamadığında 404 VET-KVKK-0001 fırlatır", async () => {
      harness.repo.findById.mockResolvedValue(null);
      await expect(
        harness.service.applyErasure(SUPERADMIN_ACTOR, "kvkk-missing"),
      ).rejects.toMatchObject({ errorCode: "VET-KVKK-0001" });
    });

    it("tamamlanmış talep tekrar uygulanamaz (409 VET-KVKK-0002)", async () => {
      harness.repo.findById.mockResolvedValue(
        makeRecord({
          status: "completed",
          completedAt: "2026-08-01T00:00:00.000Z",
        }),
      );
      await expect(
        harness.service.applyErasure(SUPERADMIN_ACTOR, "kvkk-test-id"),
      ).rejects.toMatchObject({ errorCode: "VET-KVKK-0002" });
    });

    it("rejected talep de tekrar uygulanamaz", async () => {
      harness.repo.findById.mockResolvedValue(
        makeRecord({ status: "rejected" }),
      );
      await expect(
        harness.service.applyErasure(SUPERADMIN_ACTOR, "kvkk-test-id"),
      ).rejects.toMatchObject({ errorCode: "VET-KVKK-0002" });
    });

    it("OWNER 403 alır (SUPERADMIN değil)", async () => {
      await expect(
        harness.service.applyErasure(OWNER_ACTOR, "kvkk-test-id"),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });

    it("PII alanları Owner üzerinde anonimleştirilir (kvkk-erased-<hash>)", async () => {
      harness.repo.findById.mockResolvedValue(
        makeRecord({ status: "pending", ownerId: OWNER_A }),
      );
      harness.tx.owner.findUnique.mockResolvedValue({
        id: OWNER_A,
        tenantId: TENANT_A,
      });
      harness.repo.markApplied.mockImplementation(
        async (a: {
          redactedFields: string[];
          retainedMedicalRecords: number;
        }) =>
          makeRecord({
            status: "completed",
            redactedFields: a.redactedFields,
            retainedMedicalRecords: a.retainedMedicalRecords,
          }),
      );

      await harness.service.applyErasure(SUPERADMIN_ACTOR, "kvkk-test-id");

      const updateArgs = harness.tx.owner.update.mock.calls[0]?.[0] as
        | {
            data: {
              firstName: string;
              lastName: string;
              email: string;
              phone: string;
              taxId: string;
            };
          }
        | undefined;
      expect(updateArgs).toBeDefined();
      const data = updateArgs?.data;
      expect(data?.firstName).toMatch(/^kvkk-erased-[a-f0-9]{8}$/);
      expect(data?.lastName).toMatch(/^kvkk-erased-[a-f0-9]{8}$/);
      expect(data?.email).toMatch(/^kvkk-erased-[a-f0-9]{8}$/);
      expect(data?.phone).toMatch(/^kvkk-erased-[a-f0-9]{8}$/);
      expect(data?.taxId).toMatch(/^kvkk-erased-[a-f0-9]{8}$/);
    });

    it("retained sayısı patient examination sayısından hesaplanır", async () => {
      harness.repo.findById.mockResolvedValue(
        makeRecord({ status: "pending", ownerId: OWNER_A }),
      );
      harness.tx.owner.findUnique.mockResolvedValue({
        id: OWNER_A,
        tenantId: TENANT_A,
      });
      harness.tx.patient.findMany.mockResolvedValue([
        { id: "p-1" },
        { id: "p-2" },
      ]);
      harness.tx.examination.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(5);
      harness.repo.markApplied.mockImplementation(
        async (a: { retainedMedicalRecords: number }) =>
          makeRecord({
            status: "completed",
            retainedMedicalRecords: a.retainedMedicalRecords,
          }),
      );

      const result = await harness.service.applyErasure(
        SUPERADMIN_ACTOR,
        "kvkk-test-id",
      );
      expect(result.retained).toBe(8);
    });
  });

  describe("exportTenantData", () => {
    it("OWNER için JSON formatında export üretir", async () => {
      const result = await harness.service.exportTenantData(OWNER_ACTOR);
      expect(result.format).toBe("json");
      expect(result.tenantId).toBe(TENANT_A);
      expect(result.tenantSlug).toBe("pilot-vet");
      expect(result.retentionNotice.legalBasis).toBe("KVKK_MADDE_7");
      expect(result.retentionNotice.retentionYears).toBe(7);
      expect(result.data.owners).toEqual([]);
      expect(result.data.patients).toEqual([]);
    });

    it("export 7 veri kategorisini içerir", async () => {
      const result = await harness.service.exportTenantData(OWNER_ACTOR);
      expect(Object.keys(result.data).sort()).toEqual(
        [
          "examinations",
          "owners",
          "patients",
          "payments",
          "prescriptions",
          "sales",
          "vaccinations",
        ].sort(),
      );
    });

    it("tenantId null ise 400 VET-TENANT-0001 fırlatır", async () => {
      const noTenantActor: ActorContext = { ...OWNER_ACTOR, tenantId: null };
      await expect(
        harness.service.exportTenantData(noTenantActor),
      ).rejects.toMatchObject({ errorCode: "VET-TENANT-0001" });
    });
  });

  describe("audit log formatı", () => {
    it("applyErasure audit log warn seviyesinde yazılır", async () => {
      harness.repo.findById.mockResolvedValue(
        makeRecord({ status: "pending", ownerId: OWNER_A }),
      );
      harness.tx.owner.findUnique.mockResolvedValue({
        id: OWNER_A,
        tenantId: TENANT_A,
      });
      harness.repo.markApplied.mockImplementation(
        async (a: {
          redactedFields: string[];
          retainedMedicalRecords: number;
        }) =>
          makeRecord({
            status: "completed",
            redactedFields: a.redactedFields,
            retainedMedicalRecords: a.retainedMedicalRecords,
          }),
      );

      await harness.service.applyErasure(SUPERADMIN_ACTOR, "kvkk-test-id");

      const calls = harness.logSpy.mock.calls.map((c) => asString(c[0]));
      const appliedLog = calls.find((m) => m.includes("KVKK erasure applied"));
      expect(appliedLog).toBeDefined();
      expect(appliedLog).toContain("owner=" + OWNER_A);
      expect(appliedLog).toContain(
        "redacted=firstName,lastName,email,phone,taxId,address",
      );
    });
  });
});
