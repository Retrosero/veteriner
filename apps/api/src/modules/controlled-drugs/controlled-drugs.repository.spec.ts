/**
 * @file ControlledDrugsRepository Prisma adapter testleri.
 * @module apps/api/modules/controlled-drugs/controlled-drugs.repository.spec
 * @description Kalıcı adapterin transaction içinde tenant RLS bağlamını
 * kurduğunu, append-only create kullandığını ve DB değerlerini domain kaydına
 * dönüştürdüğünü doğrular.
 * @security Test, kullanıcı tenant kimliğinin her sorguda set_config ile
 * veritabanına iletildiğini doğrular; cross-tenant sorgu filtresi atlanmaz.
 */

import { describe, expect, it, vi } from "vitest";

import { ControlledDrugsRepository } from "./controlled-drugs.repository.js";

import type { CdRegisterRecord } from "../../common/controlled-drugs/controlled-drug.types.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ENTRY_ID = "33333333-3333-3333-3333-333333333333";
const BRANCH_ID = "22222222-2222-2222-2222-222222222222";

function record(): CdRegisterRecord {
  return {
    id: ENTRY_ID,
    tenantId: TENANT_ID,
    entryType: "received",
    drugName: "Morphine",
    schedule: "S2",
    unit: "ml",
    quantityDelta: 10,
    branchId: BRANCH_ID,
    storageAreaId: "cabinet-a",
    occurredAt: "2026-08-01T09:00:00.000Z",
    recordedAt: "2026-08-01T09:01:00.000Z",
    recordedBy: "system",
    supplier: "Supplier",
    lotNumber: "LOT-001",
    expiryDate: "2027-12-31",
    ownerId: null,
    patientId: null,
    prescribedByVeterinarianId: null,
    prescriptionNumber: null,
    emergencyUse: null,
    reason: null,
    witnessUserId: null,
    targetBranchId: null,
    targetStorageAreaId: null,
    transferGroupId: null,
    physicalQuantity: null,
    bookQuantity: null,
    discrepancy: null,
    countDate: null,
    correctsEntryId: null,
    notes: null,
  };
}

function databaseRow(input: CdRegisterRecord): unknown {
  return {
    ...input,
    quantityDelta: { toNumber: (): number => input.quantityDelta },
    occurredAt: new Date(input.occurredAt),
    recordedAt: new Date(input.recordedAt),
    expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
  };
}

describe("ControlledDrugsRepository Prisma adapter", () => {
  it("insert tenant RLS bağlamı ile append-only create yapar", async () => {
    const input = record();
    const tx = {
      $executeRaw: vi.fn(async (): Promise<number> => 1),
      controlledDrugEntry: {
        create: vi.fn(async () => databaseRow(input)),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          action: (transaction: typeof tx) => Promise<unknown>,
        ): Promise<unknown> => action(tx),
      ),
    };
    const repository = new ControlledDrugsRepository(
      prisma as unknown as PrismaService,
    );

    await expect(repository.insert(input)).resolves.toMatchObject({
      id: ENTRY_ID,
      tenantId: TENANT_ID,
      quantityDelta: 10,
      expiryDate: "2027-12-31",
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.controlledDrugEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Vitest asymmetric matcher tipi `any`; yalnızca assertion verisidir.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ tenantId: TENANT_ID, id: ENTRY_ID }),
      }),
    );
  });

  it("insertMany transfer çiftini aynı transaction callback'inde oluşturur", async () => {
    const out = record();
    const input = {
      ...record(),
      id: "44444444-4444-4444-4444-444444444444",
      branchId: "55555555-5555-5555-5555-555555555555",
      quantityDelta: 10,
      entryType: "transferred" as const,
      transferGroupId: "transfer-001",
    };
    const tx = {
      $executeRaw: vi.fn(async (): Promise<number> => 1),
      controlledDrugEntry: {
        create: vi
          .fn()
          .mockResolvedValueOnce(
            databaseRow({
              ...out,
              quantityDelta: -10,
              entryType: "transferred",
              transferGroupId: "transfer-001",
            }),
          )
          .mockResolvedValueOnce(databaseRow(input)),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          action: (transaction: typeof tx) => Promise<unknown>,
        ): Promise<unknown> => action(tx),
      ),
    };
    const repository = new ControlledDrugsRepository(
      prisma as unknown as PrismaService,
    );

    const rows = await repository.insertMany([
      {
        ...out,
        quantityDelta: -10,
        entryType: "transferred",
        transferGroupId: "transfer-001",
      },
      input,
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.controlledDrugEntry.create).toHaveBeenCalledTimes(2);
    expect(rows.map((row) => row.quantityDelta)).toEqual([-10, 10]);
  });
});
