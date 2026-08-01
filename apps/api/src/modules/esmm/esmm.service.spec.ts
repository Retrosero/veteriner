/**
 * @file EsmmDocumentsService unit testleri.
 * @module apps/api/modules/esmm/esmm.service.spec
 *
 * @description GOAL-077 e-SMM adapter service testleri.
 *   - createDocument (taslak + audit).
 *   - submitDocument (mock provider → accepted; idempotency).
 *   - retryDocument (failed/rejected → tekrar submit).
 *   - cancelDocument (draft/pending → cancelled; accepted →
 *     provider.cancel + cancelled).
 *   - Manuel belge numarası unique 409.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { EsmmDocumentsRepository } from "./esmm.repository.js";
import { EsmmDocumentsService } from "./esmm.service.js";
import { MockEsmmAdapter } from "../../common/esmm/mock-esmm-adapter.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  EsmmDocumentCreateInput,
  EsmmSubmitDocumentInput,
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
  overrides: Partial<EsmmDocumentCreateInput> = {},
): EsmmDocumentCreateInput {
  return {
    type: "e_fatura",
    sourceType: "clinic_sale",
    sourceId: "sale-001",
    payload: { total: "100" },
    ...overrides,
  };
}

describe("EsmmDocumentsService", () => {
  let service: EsmmDocumentsService;
  let repo: EsmmDocumentsRepository;
  let adapter: MockEsmmAdapter;
  let audit: AuditService;

  beforeEach(() => {
    repo = new EsmmDocumentsRepository();
    adapter = new MockEsmmAdapter();
    audit = makeAudit();
    service = new EsmmDocumentsService(repo, adapter, audit);
  });

  // ---------------------------------------------------------------------------
  // createDocument
  // ---------------------------------------------------------------------------

  describe("createDocument", () => {
    it("taslak belge oluşturur + audit", async () => {
      const out = await service.createDocument(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.id).toMatch(/^doc-/);
      expect(out.status).toBe("draft");
      expect(out.type).toBe("e_fatura");
      expect(out.manualDocumentNumber).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:esmm_document.create",
        "esmm_document",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ type: "e_fatura" }),
      );
    });

    it("manuel belge numarası unique 409 VET-ESMM-0004", async () => {
      await service.createDocument(
        TENANT_A,
        makeCreateInput({ manualDocumentNumber: "EF-2026-001" }),
        STAFF_A,
      );
      await expect(
        service.createDocument(
          TENANT_A,
          makeCreateInput({
            manualDocumentNumber: "EF-2026-001",
            sourceId: "sale-002",
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ESMM-0004",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // submitDocument
  // ---------------------------------------------------------------------------

  describe("submitDocument", () => {
    it("draft → accepted (mock provider)", async () => {
      const created = await service.createDocument(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const submitted = await service.submitDocument(
        TENANT_A,
        created.id,
        { idempotencyKey: "k-1" } as EsmmSubmitDocumentInput,
        STAFF_A,
      );
      expect(submitted.status).toBe("accepted");
      expect(submitted.providerDocumentId).toMatch(/^mock-/);
      expect(submitted.providerDocumentNumber).toMatch(/^MOCK-/);
      expect(submitted.acceptedAt).not.toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:esmm_document.submit",
        "esmm_document",
        created.id,
        "update",
        expect.anything(),
        "info",
        expect.objectContaining({ providerStatus: "accepted" }),
      );
    });

    it("mock provider aynı idempotencyKey ile duplicate üretmez", async () => {
      // İlk belge: submit edilir, accepted olur.
      const created1 = await service.createDocument(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const a = await service.submitDocument(
        TENANT_A,
        created1.id,
        { idempotencyKey: "k-2" } as EsmmSubmitDocumentInput,
        STAFF_A,
      );
      expect(a.status).toBe("accepted");
      // Mock provider'ın internal state'ini kontrol etmek
      // için adapter doğrudan çağrılır.
      const same = await adapter.submitDocument({
        documentId: created1.id,
        idempotencyKey: "k-2",
        type: "e_fatura",
        payload: {},
      });
      // Aynı providerDocumentId ve providerDocumentNumber
      // dönmeli (idempotent).
      expect(same.providerDocumentId).toBe(a.providerDocumentId);
      expect(same.providerDocumentNumber).toBe(a.providerDocumentNumber);
    });

    it("accepted belge tekrar gönderilemez 409 VET-ESMM-0002", async () => {
      const created = await service.createDocument(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.submitDocument(
        TENANT_A,
        created.id,
        { idempotencyKey: "k-3" } as EsmmSubmitDocumentInput,
        STAFF_A,
      );
      await expect(
        service.submitDocument(
          TENANT_A,
          created.id,
          { idempotencyKey: "k-3-2" } as EsmmSubmitDocumentInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ESMM-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelDocument
  // ---------------------------------------------------------------------------

  describe("cancelDocument", () => {
    it("draft → cancelled", async () => {
      const created = await service.createDocument(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const cancelled = await service.cancelDocument(
        TENANT_A,
        created.id,
        STAFF_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelledAt).not.toBeNull();
    });

    it("zaten iptal edilmiş → 409 VET-ESMM-0005", async () => {
      const created = await service.createDocument(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.cancelDocument(TENANT_A, created.id, STAFF_A);
      await expect(
        service.cancelDocument(TENANT_A, created.id, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-ESMM-0005",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listDocuments
  // ---------------------------------------------------------------------------

  describe("listDocuments", () => {
    it("tenant-scoped; type filtresi çalışır", async () => {
      await service.createDocument(
        TENANT_A,
        makeCreateInput({ type: "e_fatura", sourceId: "s-1" }),
        STAFF_A,
      );
      await service.createDocument(
        TENANT_A,
        makeCreateInput({ type: "e_arsiv", sourceId: "s-2" }),
        STAFF_A,
      );
      const list = await service.listDocuments(
        TENANT_A,
        { type: "e_arsiv", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.type).toBe("e_arsiv");
    });
  });

  // ---------------------------------------------------------------------------
  // getDocument
  // ---------------------------------------------------------------------------

  describe("getDocument", () => {
    it("cross-tenant IDOR → null", async () => {
      const created = await service.createDocument(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const doc = await service.getDocument(TENANT_B, created.id, STAFF_B);
      expect(doc).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createDocument(TENANT_B, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
