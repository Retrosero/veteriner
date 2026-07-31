/**
 * @file OperationNotesService unit testleri.
 * @module apps/api/modules/operation-notes/operation-notes.service.spec
 *
 * @description GOAL-083 operasyon notu service testleri.
 *   - createOperationNote: plan in_progress olmalı; aynı plan için
 *     ikinci not 409 VET-OPNOTE-0004.
 *   - update/addTeam/addMaterial: yalnızca draft durumda
 *     (409 VET-OPNOTE-0002).
 *   - finalize: draft → finalized + her material için
 *     stock movement (clinical_use) üretilir.
 *   - amend: finalized → amended; yeni revision (draft) oluşur.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *   - Patient mismatch 422.
 *
 * @since GOAL-083 (FAZ-8) operasyon notu ve kullanılan malzemeler core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { OperationNotesService } from "./operation-notes.service.js";
import { OperationNotesRepository } from "./operation-notes.repository.js";
import { SurgeryPlansService } from "../surgery-plans/surgery-plans.service.js";
import { SurgeryPlansRepository } from "../surgery-plans/surgery-plans.repository.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";
import { StockMovementsRepository } from "../stock-movements/stock-movements.repository.js";
import type {
  OperationNoteCreateInput,
  OperationNoteFinalizeInput,
  OperationNoteMaterialInput,
  OperationNoteTeamInput,
  SurgeryPlanCreateInput,
} from "@vetniva/contracts";

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

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
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
  correlationId: "req-2b",
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

const PATIENT_A = "00000000-0000-0000-0000-000000000001";
const PATIENT_B = "00000000-0000-0000-0000-000000000002";
const SURGEON_A = "usr-surgeon-1";
const PRODUCT_A = "prd-anest-001";

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

function makeSurgeryInput(
  overrides: Partial<SurgeryPlanCreateInput> = {},
): SurgeryPlanCreateInput {
  return {
    patientId: PATIENT_A,
    leadSurgeonUserId: SURGEON_A,
    operationType: "ovariohysterectomy",
    scheduledAt: futureDate(7),
    ...overrides,
  };
}

function makeNoteInput(
  overrides: Partial<OperationNoteCreateInput> = {},
): OperationNoteCreateInput {
  return {
    surgeryPlanId: "sp-1",
    patientId: PATIENT_A,
    procedure: "Ovariohysterectomy",
    ...overrides,
  };
}

function makeTeamInput(
  overrides: Partial<OperationNoteTeamInput> = {},
): OperationNoteTeamInput {
  return {
    userId: "usr-tech-1",
    role: "technician",
    assignedAt: futureDate(7),
    ...overrides,
  };
}

function makeMaterialInput(
  overrides: Partial<OperationNoteMaterialInput> = {},
): OperationNoteMaterialInput {
  return {
    productId: PRODUCT_A,
    quantity: "2",
    unit: "adet",
    usedAt: futureDate(7),
    usedByUserId: "usr-vet-a",
    ...overrides,
  };
}

function makeFinalizeInput(
  overrides: Partial<OperationNoteFinalizeInput> = {},
): OperationNoteFinalizeInput {
  return {
    findings: "Sorunsuz cerrahi",
    closureNotes: "Deri altı emilebilir sütur",
    ...overrides,
  };
}

describe("OperationNotesService", () => {
  let service: OperationNotesService;
  let repo: OperationNotesRepository;
  let surgeryService: SurgeryPlansService;
  let surgeryRepo: SurgeryPlansRepository;
  let stockService: StockMovementsService;
  let stockRepo: StockMovementsRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new OperationNotesRepository();
    surgeryRepo = new SurgeryPlansRepository();
    stockRepo = new StockMovementsRepository();
    audit = makeAudit();
    surgeryService = new SurgeryPlansService(surgeryRepo, audit);
    // StockMovementsService yeni imza: (repo, products, inventory, audit).
    // OperationNotes finalize akışında product varlık kontrolü
    // yapılır; PRODUCT_A için geçerli stock_product döndürürüz.
    const productsStub = {
      getProduct: async (_t: string, id: string) =>
        id === PRODUCT_A
          ? {
              id: PRODUCT_A,
              tenantId: TENANT_A,
              kind: "stock_product" as const,
              sku: "prd-anest-001",
              barcode: null,
              name: "Anestezi İlaç",
              category: null,
              unit: "adet",
              taxProfile: "standard" as const,
              purchasePrice: "10.00",
              salePrice: "15.00",
              currency: "TRY",
              clinicUsage: true,
              petshopUsage: true,
              saleAvailable: true,
              purchaseTracked: true,
              vaccineProtocolId: null,
              requiresPrescription: false,
              controlledDrug: false,
              lowStockThreshold: null,
              notes: null,
              active: true,
              createdAt: "2026-07-30T00:00:00.000Z",
              createdBy: "system",
              updatedAt: "2026-07-30T00:00:00.000Z",
              archivedAt: null,
              archivedBy: null,
              archiveReason: null,
            }
          : null,
    } as unknown as ConstructorParameters<typeof StockMovementsService>[1];
    const inventoryStub = {
      getLot: async (_t: string, _id: string) => null,
    } as unknown as ConstructorParameters<typeof StockMovementsService>[2];
    stockService = new StockMovementsService(
      stockRepo,
      productsStub,
      inventoryStub,
      audit,
    );
    service = new OperationNotesService(
      repo,
      surgeryService,
      stockService,
      audit,
    );
  });

  /** Test helper: in_progress plan oluşturur, id döner. */
  async function makeInProgressPlan(): Promise<string> {
    const plan = await surgeryService.createPlan(
      TENANT_A,
      makeSurgeryInput(),
      VET_A,
    );
    await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
    return plan.id;
  }

  // -------------------------------------------------------------------------
  // createOperationNote
  // -------------------------------------------------------------------------

  describe("createOperationNote", () => {
    it("in_progress plan için yeni not oluşturur (draft)", async () => {
      const planId = await makeInProgressPlan();
      const out = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      expect(out.id).toMatch(/^op-/);
      expect(out.status).toBe("draft");
      expect(out.procedure).toBe("Ovariohysterectomy");
      expect(out.surgeryPlanId).toBe(planId);
    });

    it("plan scheduled → 422 VET-OPNOTE-0003", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      // not started
      await expect(
        service.createOperationNote(
          TENANT_A,
          makeNoteInput({ surgeryPlanId: plan.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-OPNOTE-0003",
        httpStatus: 422,
      });
    });

    it("plan completed → 422 VET-OPNOTE-0003", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      await surgeryService.completePlan(TENANT_A, plan.id, VET_A);
      await expect(
        service.createOperationNote(
          TENANT_A,
          makeNoteInput({ surgeryPlanId: plan.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-OPNOTE-0003",
        httpStatus: 422,
      });
    });

    it("patientId uyuşmazlığı → 422 VET-OPNOTE-0003", async () => {
      const planId = await makeInProgressPlan();
      await expect(
        service.createOperationNote(
          TENANT_A,
          makeNoteInput({ surgeryPlanId: planId, patientId: PATIENT_B }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-OPNOTE-0003",
        httpStatus: 422,
      });
    });

    it("aynı plan için ikinci not 409 VET-OPNOTE-0004", async () => {
      const planId = await makeInProgressPlan();
      await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      await expect(
        service.createOperationNote(
          TENANT_A,
          makeNoteInput({ surgeryPlanId: planId }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-OPNOTE-0004",
        httpStatus: 409,
      });
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      // STAFF_A is in TENANT_A; tries to create in TENANT_B
      await expect(
        service.createOperationNote(TENANT_B, makeNoteInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // addTeamMember / addMaterial
  // -------------------------------------------------------------------------

  describe("addTeamMember", () => {
    it("draft durumda ekip üyesi ekler", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      const team = await service.addTeamMember(
        TENANT_A,
        note.id,
        makeTeamInput(),
        VET_A,
      );
      expect(team.role).toBe("technician");
      expect(team.operationNoteId).toBe(note.id);
    });
  });

  describe("addMaterial", () => {
    it("draft durumda malzeme ekler", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      const mat = await service.addMaterial(
        TENANT_A,
        note.id,
        makeMaterialInput(),
        VET_A,
      );
      expect(mat.productId).toBe(PRODUCT_A);
      expect(mat.quantity).toBe("2");
      expect(mat.unit).toBe("adet");
    });
  });

  // -------------------------------------------------------------------------
  // finalize
  // -------------------------------------------------------------------------

  describe("finalizeOperationNote", () => {
    it("draft → finalized + her material için clinical_use stock movement", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      await service.addTeamMember(
        TENANT_A,
        note.id,
        makeTeamInput(),
        VET_A,
      );
      const mat = await service.addMaterial(
        TENANT_A,
        note.id,
        makeMaterialInput(),
        VET_A,
      );
      const out = await service.finalizeOperationNote(
        TENANT_A,
        note.id,
        makeFinalizeInput(),
        VET_A,
      );
      expect(out.status).toBe("finalized");
      expect(out.finalizedAt).not.toBeNull();
      expect(out.finalizedBy).toBe("usr-vet-a");

      // material stockMovementId set olmalı
      const detail = await service.getOperationNoteDetail(
        TENANT_A,
        note.id,
        VET_A,
      );
      const updatedMat = detail!.materials.find((m) => m.id === mat.id);
      expect(updatedMat!.stockMovementId).not.toBeNull();

      // stock movement oluştu mu?
      const sm = await stockService.getMovement(
        TENANT_A,
        updatedMat!.stockMovementId!,
        VET_A,
      );
      expect(sm).not.toBeNull();
      expect(sm!.type).toBe("clinical_use");
      expect(sm!.productId).toBe(PRODUCT_A);
      // negatif quantity
      expect(Number(sm!.quantity)).toBeLessThan(0);
    });

    it("finalize sonrası malzeme eklenemez 409 VET-OPNOTE-0002", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      await service.finalizeOperationNote(
        TENANT_A,
        note.id,
        makeFinalizeInput(),
        VET_A,
      );
      await expect(
        service.addMaterial(
          TENANT_A,
          note.id,
          makeMaterialInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-OPNOTE-0002",
        httpStatus: 409,
      });
    });

    it("tekrar finalize 409 VET-OPNOTE-0002", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      await service.finalizeOperationNote(
        TENANT_A,
        note.id,
        makeFinalizeInput(),
        VET_A,
      );
      await expect(
        service.finalizeOperationNote(
          TENANT_A,
          note.id,
          makeFinalizeInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-OPNOTE-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // amend
  // -------------------------------------------------------------------------

  describe("amendOperationNote", () => {
    it("finalized → amended; yeni revision (draft) oluşur", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      await service.finalizeOperationNote(
        TENANT_A,
        note.id,
        makeFinalizeInput(),
        VET_A,
      );

      const newNote = await service.amendOperationNote(
        TENANT_A,
        note.id,
        { reason: "Eksik not" },
        VET_A,
      );
      expect(newNote.id).not.toBe(note.id);
      expect(newNote.status).toBe("draft");
      expect(newNote.amendsNoteId).toBe(note.id);
      expect(newNote.amendmentReason).toBe("Eksik not");

      // orijinal amended
      const detail = await service.getOperationNoteDetail(
        TENANT_A,
        note.id,
        VET_A,
      );
      expect(detail!.operationNote.status).toBe("amended");
    });

    it("draft not amend edilemez 409 VET-OPNOTE-0005", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      await expect(
        service.amendOperationNote(
          TENANT_A,
          note.id,
          { reason: "x" },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-OPNOTE-0005",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // list / getDetail
  // -------------------------------------------------------------------------

  describe("list / getDetail", () => {
    it("listOperationNotes + getOperationNoteDetail alt kayıtları döner", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      await service.addTeamMember(
        TENANT_A,
        note.id,
        makeTeamInput(),
        VET_A,
      );
      await service.addMaterial(
        TENANT_A,
        note.id,
        makeMaterialInput(),
        VET_A,
      );

      const list = await service.listOperationNotes(
        TENANT_A,
        { limit: 50, offset: 0 },
        VET_A,
      );
      expect(list.total).toBe(1);

      const detail = await service.getOperationNoteDetail(
        TENANT_A,
        note.id,
        VET_A,
      );
      expect(detail).not.toBeNull();
      expect(detail!.team.length).toBe(1);
      expect(detail!.materials.length).toBe(1);
    });

    it("cross-tenant getDetail → null", async () => {
      const planId = await makeInProgressPlan();
      const note = await service.createOperationNote(
        TENANT_A,
        makeNoteInput({ surgeryPlanId: planId }),
        VET_A,
      );
      // STAFF_B tenantB'de; TENANT_A notu için soruyor → scope mismatch
      // → 403 VET-AUTHZ-0001 (requireTenantScope requireFind'den önce).
      await expect(
        service.getOperationNoteDetail(TENANT_A, note.id, STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
