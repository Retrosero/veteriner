/**
 * @file LabTestsService unit testleri.
 * @module apps/api/modules/lab-tests/lab-tests.service.spec
 *
 * @description GOAL-090 laboratuvar test kataloğu service
 * testleri.
 *   - createLabTest (oluşturma + audit).
 *   - duplicate code 409 VET-LABTEST-0002 (ön kontrol + P2002 race).
 *   - listLabTests (sampleType/active/search filtreleri).
 *   - getLabTestDetail (cross-tenant → null).
 *   - updateLabTest (kısmi güncelleme + arşiv).
 *   - Cross-tenant create 403 VET-AUTHZ-0001.
 *   - Update missing 404 VET-LABTEST-0001.
 *
 * @note W1.2a: Repository artık Prisma-backed. Bu testlerde service
 *   davranışını izole doğrulamak için stateful bir test double
 *   (`LabTestsRepositoryTestDouble`) kullanılır. DB seviyesinde
 *   davranış (RLS, P2002, trigger) E2E testlerle
 *   (`test/lab-tests.rls.e2e-spec.ts`) doğrulanır.
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 * @w1.2a DB persistence (in-memory → Prisma) — service testi mock'la
 */

import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LabTestsService } from "./lab-tests.service.js";

import type {
  LabTestInsertInput,
  LabTestPatch,
  LabTestSearchFilters,
  LabTestsRepository,
} from "./lab-tests.repository.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { LabTestRecord } from "../../common/lab-tests/lab-test.types.js";
import type {
  LabTestCreateInput,
  LabTestUpdateInput,
} from "@vetniva/contracts";

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

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi
      .fn()
      .mockImplementation(
        async (
          _eventName: string,
          _targetType: string,
          _targetId: string,
          _action: string,
          _actor: unknown,
          _severity: string,
        ) => ({ eventId: "ev-1" }),
      ),
  } as unknown as AuditService;
}

function makeCreateInput(
  overrides: Partial<LabTestCreateInput> = {},
): LabTestCreateInput {
  return {
    code: "CBC",
    name: "Tam kan sayımı",
    sampleType: "blood",
    unit: "10^3/µL",
    price: "120.0000",
    ...overrides,
  } as LabTestCreateInput;
}

/**
 * Service testlerini DB'den izole etmek için stateful test double.
 * Production'da `LabTestsRepository` PrismaService ile çalışır; burada
 * aynı sözleşmeyi sağlayan in-memory bir uygulama kullanılır.
 * DB seviyesi davranış (RLS, P2002, append-only trigger) E2E testlerde
 * ayrıca doğrulanır.
 */
class LabTestsRepositoryTestDouble {
  private readonly byId = new Map<string, LabTestRecord>();
  private readonly byCode = new Map<string, string>();

  public async findByCode(
    tenantId: string,
    code: string,
  ): Promise<LabTestRecord | null> {
    const id = this.byCode.get(`${tenantId}::${code.trim().toLowerCase()}`);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  public async findById(
    tenantId: string,
    id: string,
  ): Promise<LabTestRecord | null> {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public async insert(input: LabTestInsertInput): Promise<LabTestRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: LabTestRecord = {
      id,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      sampleType: input.sampleType,
      unit: input.unit,
      referenceRange: input.referenceRange,
      conditionalRanges: input.conditionalRanges,
      price: input.price,
      active: input.active,
      notes: input.notes,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
    };
    this.byId.set(id, record);
    this.byCode.set(`${input.tenantId}::${input.code.toLowerCase()}`, id);
    return record;
  }

  public async update(
    tenantId: string,
    id: string,
    patch: LabTestPatch,
  ): Promise<LabTestRecord | null> {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    if (patch.name !== undefined) rec.name = patch.name;
    if (patch.unit !== undefined) rec.unit = patch.unit;
    if (patch.referenceRange !== undefined)
      rec.referenceRange = patch.referenceRange;
    if (patch.conditionalRanges !== undefined)
      rec.conditionalRanges = patch.conditionalRanges;
    if (patch.price !== undefined) rec.price = patch.price;
    if (patch.active !== undefined) rec.active = patch.active;
    if (patch.notes !== undefined) rec.notes = patch.notes;
    rec.updatedAt = new Date().toISOString();
    return rec;
  }

  public async search(
    tenantId: string,
    filters: LabTestSearchFilters,
  ): Promise<{ items: LabTestRecord[]; total: number }> {
    const term = filters.search?.trim().toLowerCase();
    const all: LabTestRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.sampleType && rec.sampleType !== filters.sampleType) continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      if (term) {
        const codeMatch = rec.code.toLowerCase().includes(term);
        const nameMatch = rec.name.toLowerCase().includes(term);
        if (!codeMatch && !nameMatch) continue;
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "asc";
    all.sort((a, b) => {
      const cmp = a.code.localeCompare(b.code, "tr");
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }
}

describe("LabTestsService", () => {
  let service: LabTestsService;
  let repo: LabTestsRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new LabTestsRepositoryTestDouble() as unknown as LabTestsRepository;
    audit = makeAudit();
    service = new LabTestsService(repo, audit);
  });

  // ---------------------------------------------------------------------------
  // createLabTest
  // ---------------------------------------------------------------------------

  describe("createLabTest", () => {
    it("yeni katalog girdisi oluşturur + audit", async () => {
      const out = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(out.code).toBe("CBC");
      expect(out.name).toBe("Tam kan sayımı");
      expect(out.sampleType).toBe("blood");
      expect(out.price).toBe("120.0000");
      expect(out.active).toBe(true);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:labtest.create",
        "labtest",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ code: "CBC", sampleType: "blood" }),
      );
    });

    it("active default true; referenceRange/notes null", async () => {
      const out = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.active).toBe(true);
      expect(out.referenceRange).toBeNull();
      expect(out.notes).toBeNull();
      expect(out.conditionalRanges).toBeNull();
    });

    it("active=false ile pasif oluşturma", async () => {
      const out = await service.createLabTest(
        TENANT_A,
        makeCreateInput({ active: false }),
        STAFF_A,
      );
      expect(out.active).toBe(false);
    });

    it("aynı code ile 409 VET-LABTEST-0002", async () => {
      await service.createLabTest(TENANT_A, makeCreateInput(), STAFF_A);
      await expect(
        service.createLabTest(TENANT_A, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0002",
        httpStatus: 409,
      });
    });

    it("code büyük/küçük harf duyarsız unique", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN" }),
        STAFF_A,
      );
      await expect(
        service.createLabTest(
          TENANT_A,
          makeCreateInput({ code: "bun" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0002",
      });
    });

    it("farklı tenant aynı code → başarılı", async () => {
      const a = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const b = await service.createLabTest(
        TENANT_B,
        makeCreateInput(),
        STAFF_B,
      );
      expect(a.code).toBe(b.code);
      expect(a.tenantId).not.toBe(b.tenantId);
    });
  });

  // ---------------------------------------------------------------------------
  // listLabTests
  // ---------------------------------------------------------------------------

  describe("listLabTests", () => {
    it("tüm tenant kayıtlarını listeler", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC" }),
        STAFF_A,
      );
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN", sampleType: "blood" }),
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { limit: 50, offset: 0, sort: "asc" },
        STAFF_A,
      );
      expect(list.total).toBe(2);
      expect(list.items[0]!.code).toBe("BUN");
      expect(list.items[1]!.code).toBe("CBC");
    });

    it("sampleType filtresi", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC", sampleType: "blood" }),
        STAFF_A,
      );
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "UA", sampleType: "urine" }),
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { sampleType: "urine", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.code).toBe("UA");
    });

    it("active=false filtresi sadece arşivlileri getirir", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC" }),
        STAFF_A,
      );
      const b = await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN" }),
        STAFF_A,
      );
      await service.updateLabTest(
        TENANT_A,
        b.id,
        { active: false } as LabTestUpdateInput,
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { active: false, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.code).toBe("BUN");
      expect(list.items[0]!.active).toBe(false);
    });

    it("search code + name'de substring", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC", name: "Tam kan sayımı" }),
        STAFF_A,
      );
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN", name: "Üre azotu" }),
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { search: "üre", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.code).toBe("BUN");
    });

    it("cross-tenant IDOR → boş", async () => {
      await service.createLabTest(TENANT_A, makeCreateInput(), STAFF_A);
      const list = await service.listLabTests(
        TENANT_B,
        { limit: 50, offset: 0 },
        STAFF_B,
      );
      expect(list.total).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getLabTestDetail
  // ---------------------------------------------------------------------------

  describe("getLabTestDetail", () => {
    it("kendi tenant içinde bulur", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const got = await service.getLabTestDetail(TENANT_A, created.id, STAFF_A);
      expect(got?.id).toBe(created.id);
    });

    it("cross-tenant IDOR → null", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const got = await service.getLabTestDetail(TENANT_B, created.id, STAFF_B);
      expect(got).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updateLabTest
  // ---------------------------------------------------------------------------

  describe("updateLabTest", () => {
    it("kısmi güncelleme + audit", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const updated = await service.updateLabTest(
        TENANT_A,
        created.id,
        { name: "Tam kan (panel)", price: "150.00" } as LabTestUpdateInput,
        STAFF_A,
      );
      expect(updated.name).toBe("Tam kan (panel)");
      expect(updated.price).toBe("150.00");
      expect(updated.code).toBe("CBC");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:labtest.update",
        "labtest",
        created.id,
        "update",
        expect.anything(),
        "info",
        expect.objectContaining({ code: "CBC" }),
      );
    });

    it("active=false ile arşivleme", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const updated = await service.updateLabTest(
        TENANT_A,
        created.id,
        { active: false } as LabTestUpdateInput,
        STAFF_A,
      );
      expect(updated.active).toBe(false);
    });

    it("bulunamadı → 404 VET-LABTEST-0001", async () => {
      await expect(
        service.updateLabTest(
          TENANT_A,
          "00000000-0000-0000-0000-000000000999",
          { name: "x" } as LabTestUpdateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0001",
        httpStatus: 404,
      });
    });

    it("cross-tenant update 404", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await expect(
        service.updateLabTest(
          TENANT_B,
          created.id,
          { name: "x" } as LabTestUpdateInput,
          STAFF_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0001",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createLabTest(TENANT_B, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant list 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.listLabTests(TENANT_B, { limit: 50, offset: 0 }, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
