/**
 * @file PatientsService.transferOwnership unit testleri.
 * @module apps/api/modules/patients/ownership-transfer.spec
 *
 * @description GOAL-022 hayvan sahiplik devri (kimlik seviyesi) iş
 * kuralları testleri: cross-tenant guard, arşiv koruması, aynı kişi
 * reddi, audit before/after + PII alan hazırlığı, in-memory transfer
 * audit map. OwnershipHistoryService bağımlılığı `noop` mock'lanır
 * (bu test kapsamı yalnızca kimlik-seviyesi devir).
 *
 * @since GOAL-022 (FAZ-2) sahiplik devri core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Owner } from "../../common/owners/owner.types.js";
import type { OwnersService } from "../owners/owners.service.js";
import type { OwnershipHistoryService } from "../ownership-history/ownership-history.service.js";

import { PatientsService } from "./patients.service.js";
import { PatientsRepository } from "./patients.repository.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-tx-1",
  ipAddress: "10.0.0.***",
  userAgentHash: "a1b2c3d4",
  source: "header",
};

const STAFF_B: ActorContext = {
  actorId: "usr-staff-b",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-tx-2",
  ipAddress: "10.0.0.***",
  userAgentHash: "a1b2c3d4",
  source: "header",
};

const OLD_OWNER_ID = "11111111-1111-1111-1111-111111111111";
const NEW_OWNER_ID = "33333333-3333-3333-3333-333333333333";
const OWNER_B_ID = "22222222-2222-2222-2222-222222222222";

/** Mock owner store: key = tenantId|ownerId → Owner. */
const ownersStore = new Map<string, Owner>();

function seedOwner(
  tenantId: string,
  id: string,
  overrides: Partial<Owner> = {},
): void {
  const owner: Owner = {
    id,
    tenantId,
    firstName: overrides.firstName ?? "Owner",
    lastName: overrides.lastName ?? "Test",
    phone: overrides.phone ?? "+905320000000",
    email: overrides.email ?? null,
    taxId: null,
    address: null,
    consents: { kvkk: true, marketing: false },
    createdAt: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
  ownersStore.set(`${tenantId}|${id}`, owner);
}

function makeOwners(): OwnersService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          ownersStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as OwnersService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function makeOwnership(): OwnershipHistoryService {
  // Bu test kapsamı yalnızca kimlik-seviyesi devir; ownership service
  // yalnızca createInitial ile entegre olduğu için burada no-op.
  return {
    createInitial: vi.fn().mockResolvedValue(null),
  } as unknown as OwnershipHistoryService;
}

function validInput(overrides: Partial<{
  ownerId: string;
  name: string;
}> = {}) {
  return {
    ownerId: OLD_OWNER_ID,
    name: "Boncuk",
    species: "dog" as const,
    gender: "male" as const,
    neutered: false,
    ...overrides,
  };
}

describe("PatientsService.transferOwnership", () => {
  let service: PatientsService;
  let repo: PatientsRepository;
  let owners: OwnersService;
  let audit: AuditService;
  let ownership: OwnershipHistoryService;

  beforeEach(async () => {
    ownersStore.clear();
    seedOwner(TENANT_A, OLD_OWNER_ID, {
      firstName: "Ahmet",
      lastName: "Yılmaz",
      email: "ahmet@example.com",
      phone: "+905321111111",
    });
    seedOwner(TENANT_A, NEW_OWNER_ID, {
      firstName: "Ayşe",
      lastName: "Demir",
      email: "ayse@example.com",
      phone: "+905322222222",
    });
    seedOwner(TENANT_B, OWNER_B_ID);
    repo = new PatientsRepository();
    owners = makeOwners();
    audit = makeAudit();
    ownership = makeOwnership();
    const alerts = {
      getActiveAlertsForPatient: vi.fn().mockResolvedValue([]),
    } as unknown as import("../alerts/alerts.service.js").AlertsService;
    service = new PatientsService(owners, repo, audit, ownership, alerts);

    // Hasta oluştur (createInitial mock'lu, audit çağrısı ayrı).
    await service.create(TENANT_A, validInput(), STAFF_A);
  });

  it("başarı: transfer edilir, audit:patient.transfer (warning) yayınlanır, transferId döner", async () => {
    const created = (await service.search(
      TENANT_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    )).items[0]!;
    const before = (audit.record as ReturnType<typeof vi.fn>).mock.calls.length;

    const result = await service.transferOwnership(
      TENANT_A,
      created.id,
      NEW_OWNER_ID,
      "Sahibinin vefatı",
      STAFF_A,
    );

    expect(result.transferId).toMatch(/^txf-/);
    expect(result.patient.ownerId).toBe(NEW_OWNER_ID);
    expect(result.patient.tenantId).toBe(TENANT_A);

    // Ek audit çağrısı (transfer) eklendi.
    const after = (audit.record as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(after).toBe(before + 1);

    const lastCall = (audit.record as ReturnType<typeof vi.fn>).mock
      .calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({
      eventName: "audit:patient.transfer",
      targetType: "patient",
      targetId: created.id,
      action: "transfer",
      severity: "warning",
      tenantId: TENANT_A,
      actorId: STAFF_A.actorId,
    });
  });

  it("audit before/after ownerId doğru + PII alanları (firstName/email/phone) hazırlanır", async () => {
    const created = (await service.search(
      TENANT_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    )).items[0]!;

    await service.transferOwnership(
      TENANT_A,
      created.id,
      NEW_OWNER_ID,
      "devir",
      STAFF_A,
    );

    const call = (audit.record as ReturnType<typeof vi.fn>).mock
      .calls.at(-1)?.[0];
    // before: eski sahip bilgisi.
    expect(call.before).toMatchObject({
      ownerId: OLD_OWNER_ID,
      ownerName: "Ahmet Yılmaz",
      ownerEmail: "ahmet@example.com",
      ownerPhone: "+905321111111",
    });
    // after: yeni sahip bilgisi.
    expect(call.after).toMatchObject({
      ownerId: NEW_OWNER_ID,
      ownerName: "Ayşe Demir",
      ownerEmail: "ayse@example.com",
      ownerPhone: "+905322222222",
    });
    // metadata: neden + ownerId'ler.
    expect(call.metadata).toMatchObject({
      reason: "devir",
      previousOwnerId: OLD_OWNER_ID,
      newOwnerId: NEW_OWNER_ID,
      source: "header",
    });
  });

  it("in-memory transfer audit map güncellenir ve getTransferAudit döndürür", async () => {
    const created = (await service.search(
      TENANT_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    )).items[0]!;

    const { transferId } = await service.transferOwnership(
      TENANT_A,
      created.id,
      NEW_OWNER_ID,
      "Sahiplik devri",
      STAFF_A,
    );

    const entry = service.getTransferAudit(TENANT_A, transferId);
    expect(entry).not.toBeNull();
    expect(entry).toMatchObject({
      id: transferId,
      tenantId: TENANT_A,
      patientId: created.id,
      previousOwnerId: OLD_OWNER_ID,
      newOwnerId: NEW_OWNER_ID,
      reason: "Sahiplik devri",
      actorId: STAFF_A.actorId,
    });
    expect(entry?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Cross-tenant okuma → null.
    expect(service.getTransferAudit(TENANT_B, transferId)).toBeNull();
  });

  it("cross-tenant patient → 404 VET-AUTHZ-0002, audit çağrılmaz", async () => {
    const created = (await service.search(
      TENANT_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    )).items[0]!;

    const callsBefore = (audit.record as ReturnType<typeof vi.fn>).mock
      .calls.length;

    await expect(
      service.transferOwnership(
        TENANT_B,
        created.id,
        OWNER_B_ID,
        "test",
        STAFF_B,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0002",
      httpStatus: 404,
    });

    // create audit'i (info) tek call olmalı; transfer audit'i yok.
    const callsAfter = (audit.record as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(callsAfter).toBe(callsBefore);
  });

  it("cross-tenant new owner → 404 VET-AUTHZ-0002", async () => {
    const created = (await service.search(
      TENANT_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    )).items[0]!;

    // OWNER_B_ID yalnızca TENANT_B'de seed'li; TENANT_A'da aranırsa
    // → null → 404 VET-AUTHZ-0002.
    await expect(
      service.transferOwnership(
        TENANT_A,
        created.id,
        OWNER_B_ID,
        "test",
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0002",
      httpStatus: 404,
      details: { newOwnerId: OWNER_B_ID },
    });
  });

  it("arşivli patient → 422 VET-CLINIC-0005, ownerId değişmez", async () => {
    const created = (await service.search(
      TENANT_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    )).items[0]!;
    await service.archive(TENANT_A, created.id, STAFF_A);

    await expect(
      service.transferOwnership(
        TENANT_A,
        created.id,
        NEW_OWNER_ID,
        "test",
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-CLINIC-0005",
      httpStatus: 422,
    });

    // Owner hâlâ eski.
    const reloaded = await service.findById(TENANT_A, created.id, STAFF_A);
    expect(reloaded?.ownerId).toBe(OLD_OWNER_ID);
  });

  it("aynı owner'a transfer → 422 VET-CLINIC-0007", async () => {
    const created = (await service.search(
      TENANT_A,
      { limit: 20, offset: 0 },
      STAFF_A,
    )).items[0]!;

    await expect(
      service.transferOwnership(
        TENANT_A,
        created.id,
        OLD_OWNER_ID, // mevcut sahibin kendisi
        "test",
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-CLINIC-0007",
      httpStatus: 422,
      details: { ownerId: OLD_OWNER_ID },
    });
  });

  it("olmayan patientId → 404 VET-AUTHZ-0002", async () => {
    await expect(
      service.transferOwnership(
        TENANT_A,
        "00000000-0000-0000-0000-000000000000",
        NEW_OWNER_ID,
        "test",
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0002",
      httpStatus: 404,
    });
  });
});
