/**
 * @file ControlledDrugsService unit testleri.
 * @module apps/api/modules/controlled-drugs/controlled-drugs.service.spec
 * @description GOAL-143 controlled-drug defterinin append-only hareket,
 * tenant izolasyonu, çift imza ve ters kayıt kurallarını doğrular.
 * Repository in-memory olduğundan DB/RLS entegrasyon testi sonraki
 * kalıcılık goal'unda Prisma adapteriyle ayrıca yazılacaktır.
 * @security Tenant kimliği yalnız actor bağlamından değerlendirilir;
 * çapraz tenant erişim denemesi 403 ile reddedilir.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ControlledDrugsRepository } from "./controlled-drugs.repository.js";
import { ControlledDrugsService } from "./controlled-drugs.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  CdDispensingInput,
  CdReceiptInput,
  CdTransferInput,
} from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const ACTOR_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: "brn-a",
  isSuperadmin: false,
  correlationId: "req-cd-a",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const ACTOR_B: ActorContext = {
  ...ACTOR_A,
  actorId: "usr-vet-b",
  tenantId: TENANT_B,
  correlationId: "req-cd-b",
};

/** Testte çağrıları doğrulamak için audit servisinin minimal taklidini üretir. */
function createAuditMock(): AuditService {
  return {
    recordSimple: vi.fn().mockResolvedValue({ eventId: "audit-cd-1" }),
  } as unknown as AuditService;
}

/**
 * Geçerli bir receipt girdisi üretir.
 * @param overrides Varsayılan girdinin test için değiştirilecek alanları.
 */
function receiptInput(overrides: Partial<CdReceiptInput> = {}): CdReceiptInput {
  return {
    drugName: "Morphine",
    schedule: "S2",
    unit: "ml",
    quantity: 10,
    branchId: "brn-a",
    storageAreaId: "cabinet-a",
    supplier: "Veterinary supplier",
    lotNumber: "LOT-001",
    expiryDate: "2027-12-31",
    occurredAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  };
}

/**
 * Geçerli bir dispensing girdisi üretir.
 * @param overrides Varsayılan girdinin test için değiştirilecek alanları.
 */
function dispensingInput(
  overrides: Partial<CdDispensingInput> = {},
): CdDispensingInput {
  return {
    drugName: "Morphine",
    schedule: "S2",
    unit: "ml",
    quantity: 2,
    branchId: "brn-a",
    storageAreaId: "cabinet-a",
    ownerId: "own-a",
    patientId: "pat-a",
    prescribedByVeterinarianId: "usr-vet-a",
    prescriptionNumber: "RX-001",
    occurredAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("ControlledDrugsService", () => {
  let repository: ControlledDrugsRepository;
  let audit: AuditService;
  let service: ControlledDrugsService;

  beforeEach(() => {
    repository = new ControlledDrugsRepository();
    audit = createAuditMock();
    service = new ControlledDrugsService(repository, audit);
  });

  it("alım append-only kayıt ve pozitif stok etkisi üretir", async () => {
    const entry = await service.recordReceipt(
      TENANT_A,
      receiptInput(),
      ACTOR_A,
    );

    expect(entry.entryType).toBe("received");
    expect(entry.quantityDelta).toBe(10);
    expect(entry.supplier).toBe("Veterinary supplier");
    await expect(service.getStock(TENANT_A, ACTOR_A)).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ currentQuantity: 10 })],
    });
    // AuditService taklidindeki spy, `this` kullanmaz; spy kimliği korunmalıdır.

    expect(audit.recordSimple).toHaveBeenCalledWith(
      "audit:cd.stock_received",
      "controlled_drug_entry",
      entry.id,
      "receive",
      expect.objectContaining({ tenantId: TENANT_A }),
      "info",
      expect.any(Object),
    );
  });

  it("acil olmayan kullanımda owner ve patient zorunludur", async () => {
    await expect(
      service.recordDispensing(
        TENANT_A,
        dispensingInput({ ownerId: undefined, patientId: undefined }),
        ACTOR_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-CD-0001", httpStatus: 422 });
  });

  it("acil kullanım owner/patient olmadan kaydedilebilir", async () => {
    const entry = await service.recordDispensing(
      TENANT_A,
      dispensingInput({
        ownerId: undefined,
        patientId: undefined,
        emergencyUse: true,
      }),
      ACTOR_A,
    );

    expect(entry.quantityDelta).toBe(-2);
    expect(entry.emergencyUse).toBe(true);
    expect(entry.ownerId).toBeNull();
  });

  it("S2 imha işleminde işlemi yapan kişi tanık olamaz", async () => {
    await expect(
      service.recordWastage(
        TENANT_A,
        {
          ...receiptInput(),
          quantity: 1,
          reason: "expired",
          witnessUserId: ACTOR_A.actorId!,
        },
        ACTOR_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-CD-0003", httpStatus: 422 });
  });

  it("transfer aynı grup altında negatif ve pozitif iki kayıt oluşturur", async () => {
    const input: CdTransferInput = {
      drugName: "Morphine",
      schedule: "S2",
      unit: "ml",
      quantity: 3,
      branchId: "brn-a",
      storageAreaId: "cabinet-a",
      targetBranchId: "brn-b",
      targetStorageAreaId: "cabinet-b",
      transferGroupId: "trf-001",
      occurredAt: "2026-08-01T11:00:00.000Z",
    };

    const result = await service.recordTransfer(TENANT_A, input, ACTOR_A);

    expect(result.out.quantityDelta).toBe(-3);
    expect(result.in.quantityDelta).toBe(3);
    expect(result.out.transferGroupId).toBe("trf-001");
    expect(result.in.transferGroupId).toBe("trf-001");
    await expect(service.getStock(TENANT_A, ACTOR_A)).resolves.toMatchObject({
      // Vitest asymmetric matcher tipi `any`; yalnızca assertion verisidir.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      items: expect.arrayContaining([
        expect.objectContaining({
          branchId: "brn-a",
          storageAreaId: "cabinet-a",
          currentQuantity: -3,
        }),
        expect.objectContaining({
          branchId: "brn-b",
          storageAreaId: "cabinet-b",
          currentQuantity: 3,
        }),
      ]),
    });
  });

  it("düzeltme orijinal kaydı değiştirmeden ters hareket ekler", async () => {
    const original = await service.recordReceipt(
      TENANT_A,
      receiptInput(),
      ACTOR_A,
    );
    const correction = await service.correctEntry(
      TENANT_A,
      { originalEntryId: original.id, reason: "Yanlış miktar" },
      ACTOR_A,
    );

    expect(correction.entryType).toBe("correction");
    expect(correction.quantityDelta).toBe(-10);
    expect(correction.correctsEntryId).toBe(original.id);
    await expect(repository.findById(original.id)).resolves.toMatchObject({
      quantityDelta: 10,
    });
    await expect(service.getStock(TENANT_A, ACTOR_A)).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ currentQuantity: 0 })],
    });
    await expect(
      service.correctEntry(
        TENANT_A,
        { originalEntryId: original.id, reason: "Tekrar deneme" },
        ACTOR_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-CD-0007", httpStatus: 422 });
  });

  it("eşzamanlı correction unique ihlalini alan hatasına dönüştürür", async () => {
    const original = await service.recordReceipt(
      TENANT_A,
      receiptInput(),
      ACTOR_A,
    );
    vi.spyOn(repository, "insert").mockRejectedValueOnce({ code: "P2002" });

    await expect(
      service.correctEntry(
        TENANT_A,
        { originalEntryId: original.id, reason: "Eşzamanlı düzeltme" },
        ACTOR_A,
      ),
    ).rejects.toMatchObject({ errorCode: "VET-CD-0007", httpStatus: 422 });
  });

  it("çapraz tenant yazma denemesi reddedilir", async () => {
    await expect(
      service.recordReceipt(TENANT_A, receiptInput(), ACTOR_B),
    ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001", httpStatus: 403 });
  });

  it("listeleme sadece aktif tenant kayıtlarını döndürür", async () => {
    await service.recordReceipt(TENANT_A, receiptInput(), ACTOR_A);
    const list = await service.list(
      TENANT_A,
      { limit: 20, offset: 0 },
      ACTOR_A,
    );

    expect(list.total).toBe(1);
    expect(list.items[0]?.tenantId).toBe(TENANT_A);
  });
});
