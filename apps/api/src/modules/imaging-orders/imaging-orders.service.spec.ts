/**
 * @file ImagingOrdersService unit testleri.
 * @module apps/api/modules/imaging-orders/imaging-orders.service.spec
 *
 * @description GOAL-093 görüntüleme isteği service testleri.
 *   - createImagingOrder (katalog snapshot + audit).
 *   - state machine: ordered → scheduled → performed → reported → completed.
 *   - rapor onayı + amendment.
 *   - cancelImagingOrder (ordered|scheduled → cancelled; diğer 409).
 *   - katalog pasif/bulunamadı 422.
 *   - listImagingOrders / getImagingOrderDetail (tenant-scoped).
 *   - Cross-tenant IDOR / create 403.
 *
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImagingOrdersRepository } from "./imaging-orders.repository.js";
import { ImagingOrdersService } from "./imaging-orders.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  ImagingOrderAmendReportInput,
  ImagingOrderApproveReportInput,
  ImagingOrderCancelInput,
  ImagingOrderCompleteInput,
  ImagingOrderCreateInput,
  ImagingOrderPerformInput,
  ImagingOrderReportInput,
  ImagingOrderScheduleInput,
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

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1v",
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

const PATIENT_A = "00000000-0000-0000-0000-000000000001";
const IMG_TEST_ID = "00000000-0000-0000-0000-000000010001"; // XR-THX
const IMG_TEST_ID_INACTIVE = "00000000-0000-0000-0000-000000010011"; // XR-THX-PORTABLE
const IMG_TEST_ID_MISSING = "00000000-0000-0000-0000-000000010999";
const VET_USER_ID = "00000000-0000-0000-0000-000000000020";

function makeCreateInput(
  overrides: Partial<ImagingOrderCreateInput> = {},
): ImagingOrderCreateInput {
  return {
    patientId: PATIENT_A,
    imagingTestId: IMG_TEST_ID,
    sourceType: "manual",
    priority: "routine",
    ...overrides,
  } as ImagingOrderCreateInput;
}

describe("ImagingOrdersService", () => {
  let service: ImagingOrdersService;
  let repo: ImagingOrdersRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new ImagingOrdersRepository();
    audit = makeAudit();
    service = new ImagingOrdersService(repo, audit);
  });

  // -------------------------------------------------------------------------
  // createImagingOrder
  // -------------------------------------------------------------------------

  describe("createImagingOrder", () => {
    it("yeni sipariş oluşturur (status=ordered) + katalog snapshot", async () => {
      const out = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      expect(out.id).toMatch(/^io-/);
      expect(out.status).toBe("ordered");
      expect(out.imagingTestCode).toBe("XR-THX");
      expect(out.imagingTestName).toBe("Toraks röntgeni (iki yönlü)");
      expect(out.modality).toBe("xray");
      expect(out.bodyPart).toBe("thorax");
      expect(out.price).toBe("180.0000");
      expect(out.priority).toBe("routine");
      expect(out.scheduledAt).toBeNull();
      expect(out.performedAt).toBeNull();
      expect(out.reportRevisions).toEqual([]);
      expect(out.report).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:imgorder.create",
        "imgorder",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({
          imagingTestCode: "XR-THX",
          modality: "xray",
        }),
      );
    });

    it("input bodyPart katalog boşsa serbest metin kabul eder", async () => {
      const out = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput({ bodyPart: "sağ ön bacak" }),
        VET_A,
      );
      expect(out.bodyPart).toBe("sağ ön bacak");
    });

    it("katalog yoksa 422 VET-IMG-0003", async () => {
      await expect(
        service.createImagingOrder(
          TENANT_A,
          makeCreateInput({ imagingTestId: IMG_TEST_ID_MISSING }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-IMG-0003",
        httpStatus: 422,
      });
    });

    it("pasif katalog 422 VET-IMG-0004", async () => {
      await expect(
        service.createImagingOrder(
          TENANT_A,
          makeCreateInput({ imagingTestId: IMG_TEST_ID_INACTIVE }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-IMG-0004",
        httpStatus: 422,
      });
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createImagingOrder(TENANT_A, makeCreateInput(), STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // scheduleImagingOrder
  // -------------------------------------------------------------------------

  describe("scheduleImagingOrder", () => {
    it("ordered → scheduled", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const out = await service.scheduleImagingOrder(
        TENANT_A,
        created.id,
        {
          scheduledAt: "2026-08-01T10:00:00.000Z",
          scheduledLocation: "Röntgen odası 1",
        } as ImagingOrderScheduleInput,
        VET_A,
      );
      expect(out.status).toBe("scheduled");
      expect(out.scheduledAt).toBe("2026-08-01T10:00:00.000Z");
      expect(out.scheduledLocation).toBe("Röntgen odası 1");
    });

    it("scheduled durumundan tekrar planlama 409 VET-IMG-0002", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.scheduleImagingOrder(
        TENANT_A,
        created.id,
        {
          scheduledAt: "2026-08-01T10:00:00.000Z",
        } as ImagingOrderScheduleInput,
        VET_A,
      );
      await expect(
        service.scheduleImagingOrder(
          TENANT_A,
          created.id,
          {
            scheduledAt: "2026-08-02T10:00:00.000Z",
          } as ImagingOrderScheduleInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-IMG-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // performImagingOrder
  // -------------------------------------------------------------------------

  describe("performImagingOrder", () => {
    it("scheduled → performed + attachments", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.scheduleImagingOrder(
        TENANT_A,
        created.id,
        {
          scheduledAt: "2026-08-01T10:00:00.000Z",
        } as ImagingOrderScheduleInput,
        VET_A,
      );
      const out = await service.performImagingOrder(
        TENANT_A,
        created.id,
        {
          performedAt: "2026-08-01T10:30:00.000Z",
          performedByUserId: VET_USER_ID,
          contrastUse: "iv",
          attachments: ["file-xray-1.dcm", "file-xray-2.dcm"],
        } as ImagingOrderPerformInput,
        STAFF_A,
      );
      expect(out.status).toBe("performed");
      expect(out.attachments).toEqual(["file-xray-1.dcm", "file-xray-2.dcm"]);
      expect(out.contrastUse).toBe("iv");
      expect(out.performedByUserId).toBe(VET_USER_ID);
    });

    it("ordered → perform 409 VET-IMG-0002", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await expect(
        service.performImagingOrder(
          TENANT_A,
          created.id,
          {} as ImagingOrderPerformInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-IMG-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // reportImagingOrder / approveReport / amendReport
  // -------------------------------------------------------------------------

  describe("rapor akışı", () => {
    async function setupPerformedOrder() {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.scheduleImagingOrder(
        TENANT_A,
        created.id,
        {
          scheduledAt: "2026-08-01T10:00:00.000Z",
        } as ImagingOrderScheduleInput,
        VET_A,
      );
      await service.performImagingOrder(
        TENANT_A,
        created.id,
        {
          attachments: ["file.dcm"],
        } as ImagingOrderPerformInput,
        STAFF_A,
      );
      return created.id;
    }

    it("performed → reported (revision 1)", async () => {
      const id = await setupPerformedOrder();
      const out = await service.reportImagingOrder(
        TENANT_A,
        id,
        {
          findings: "Normal akciğer alanları.",
          impression: "Patoloji saptanmadı.",
          recommendation: "Kontrol gerekmez.",
        } as ImagingOrderReportInput,
        VET_A,
      );
      expect(out.status).toBe("reported");
      expect(out.report?.revision).toBe(1);
      expect(out.report?.findings).toBe("Normal akciğer alanları.");
      expect(out.report?.approved).toBe(false);
      expect(out.report?.portalVisible).toBe(false);
      expect(out.reportRevisions).toHaveLength(1);
    });

    it("rapor onayı + portalVisible=true", async () => {
      const id = await setupPerformedOrder();
      await service.reportImagingOrder(
        TENANT_A,
        id,
        {
          findings: "x",
          impression: "y",
        } as ImagingOrderReportInput,
        VET_A,
      );
      const out = await service.approveReport(
        TENANT_A,
        id,
        {
          portalVisible: true,
          reviewNotes: "İncelendi, uygun.",
        } as ImagingOrderApproveReportInput,
        VET_A,
      );
      expect(out.status).toBe("reported");
      expect(out.report?.approved).toBe(true);
      expect(out.report?.portalVisible).toBe(true);
      expect(out.report?.approvedBy).toBe(VET_A.actorId);
      expect(out.report?.reviewNotes).toBe("İncelendi, uygun.");
    });

    it("onaylanmamış rapor zaten onaylı 409 VET-IMG-0008", async () => {
      const id = await setupPerformedOrder();
      await service.reportImagingOrder(
        TENANT_A,
        id,
        {
          findings: "x",
          impression: "y",
        } as ImagingOrderReportInput,
        VET_A,
      );
      await service.approveReport(
        TENANT_A,
        id,
        {} as ImagingOrderApproveReportInput,
        VET_A,
      );
      await expect(
        service.approveReport(
          TENANT_A,
          id,
          {} as ImagingOrderApproveReportInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-IMG-0008",
        httpStatus: 409,
      });
    });

    it("amendment → yeni revision oluşur", async () => {
      const id = await setupPerformedOrder();
      await service.reportImagingOrder(
        TENANT_A,
        id,
        {
          findings: "x",
          impression: "y",
        } as ImagingOrderReportInput,
        VET_A,
      );
      const out = await service.amendReport(
        TENANT_A,
        id,
        {
          reason: "Ekip hatası düzeltme",
          findings: "x (düzeltme)",
          impression: "y (düzeltme)",
        } as ImagingOrderAmendReportInput,
        VET_A,
      );
      expect(out.status).toBe("amended");
      expect(out.report?.revision).toBe(2);
      expect(out.report?.amendmentReason).toBe("Ekip hatası düzeltme");
      expect(out.reportRevisions).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // completeImagingOrder
  // -------------------------------------------------------------------------

  describe("completeImagingOrder", () => {
    it("reported → completed", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.scheduleImagingOrder(
        TENANT_A,
        created.id,
        {
          scheduledAt: "2026-08-01T10:00:00.000Z",
        } as ImagingOrderScheduleInput,
        VET_A,
      );
      await service.performImagingOrder(
        TENANT_A,
        created.id,
        {} as ImagingOrderPerformInput,
        STAFF_A,
      );
      await service.reportImagingOrder(
        TENANT_A,
        created.id,
        {
          findings: "x",
          impression: "y",
        } as ImagingOrderReportInput,
        VET_A,
      );
      const out = await service.completeImagingOrder(
        TENANT_A,
        created.id,
        {} as ImagingOrderCompleteInput,
        VET_A,
      );
      expect(out.status).toBe("completed");
    });

    it("ordered → complete 409 VET-IMG-0002", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await expect(
        service.completeImagingOrder(
          TENANT_A,
          created.id,
          {} as ImagingOrderCompleteInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-IMG-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // cancelImagingOrder
  // -------------------------------------------------------------------------

  describe("cancelImagingOrder", () => {
    it("ordered → cancelled + audit", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const out = await service.cancelImagingOrder(
        TENANT_A,
        created.id,
        {
          reason: "Hasta gelmedi",
        } as ImagingOrderCancelInput,
        VET_A,
      );
      expect(out.status).toBe("cancelled");
      expect(out.cancelReason).toBe("Hasta gelmedi");
      expect(out.cancelledBy).toBe(VET_A.actorId);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:imgorder.cancel",
        "imgorder",
        created.id,
        "archive",
        expect.anything(),
        "warning",
        expect.objectContaining({ reason: "Hasta gelmedi" }),
      );
    });

    it("performed → cancel 409 VET-IMG-0002", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.scheduleImagingOrder(
        TENANT_A,
        created.id,
        {
          scheduledAt: "2026-08-01T10:00:00.000Z",
        } as ImagingOrderScheduleInput,
        VET_A,
      );
      await service.performImagingOrder(
        TENANT_A,
        created.id,
        {} as ImagingOrderPerformInput,
        STAFF_A,
      );
      await expect(
        service.cancelImagingOrder(
          TENANT_A,
          created.id,
          {
            reason: "x",
          } as ImagingOrderCancelInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-IMG-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // listImagingOrders / getImagingOrderDetail
  // -------------------------------------------------------------------------

  describe("listImagingOrders", () => {
    it("tüm tenant kayıtlarını listeler", async () => {
      await service.createImagingOrder(TENANT_A, makeCreateInput(), VET_A);
      await service.createImagingOrder(
        TENANT_A,
        makeCreateInput({ priority: "urgent" }),
        VET_A,
      );
      const list = await service.listImagingOrders(
        TENANT_A,
        { limit: 50, offset: 0 },
        VET_A,
      );
      expect(list.total).toBe(2);
    });

    it("modality filtresi", async () => {
      await service.createImagingOrder(
        TENANT_A,
        makeCreateInput({ imagingTestId: IMG_TEST_ID }),
        VET_A,
      );
      // CT-THX test
      await service.createImagingOrder(
        TENANT_A,
        makeCreateInput({
          imagingTestId: "00000000-0000-0000-0000-000000010006",
        }),
        VET_A,
      );
      const list = await service.listImagingOrders(
        TENANT_A,
        { modality: "ct", limit: 50, offset: 0 },
        VET_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.modality).toBe("ct");
    });

    it("cross-tenant IDOR → boş", async () => {
      await service.createImagingOrder(TENANT_A, makeCreateInput(), VET_A);
      const list = await service.listImagingOrders(
        TENANT_B,
        { limit: 50, offset: 0 },
        STAFF_B,
      );
      expect(list.total).toBe(0);
    });
  });

  describe("getImagingOrderDetail", () => {
    it("kendi tenant içinde bulur", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const got = await service.getImagingOrderDetail(
        TENANT_A,
        created.id,
        VET_A,
      );
      expect(got?.id).toBe(created.id);
    });

    it("cross-tenant IDOR → null", async () => {
      const created = await service.createImagingOrder(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const got = await service.getImagingOrderDetail(
        TENANT_B,
        created.id,
        STAFF_B,
      );
      expect(got).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Tenant izolasyonu
  // -------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant list 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.listImagingOrders(TENANT_B, { limit: 50, offset: 0 }, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
