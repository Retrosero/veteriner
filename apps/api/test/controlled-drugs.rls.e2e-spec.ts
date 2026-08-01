/**
 * @file Controlled Drugs PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle controlled-drug defterini doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Append-only trigger'ı RLS bağlamı doğru olsa dahi UPDATE'i
 * reddetmelidir. Test rolü yalnızca geçici E2E veritabanında oluşturulur.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthRepository } from "../src/common/auth/auth.repository.js";
import { RbacRepository } from "../src/common/rbac/rbac.repository.js";
import { BranchRepository } from "../src/modules/branch/branch.repository.js";
import { ControlledDrugsRepository } from "../src/modules/controlled-drugs/controlled-drugs.repository.js";
import { FileRepository } from "../src/modules/file/file.repository.js";

import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];

if (!migratorDatabaseUrl) {
  throw new Error(
    "DATABASE_MIGRATOR_URL zorunludur; RLS E2E fixture/rol bootstrap'ı runtime uygulama rolüyle çalıştırılamaz.",
  );
}

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl } },
});
const appRoleName = "vetniva_e2e_app";
const runtimeDatabaseUrl = process.env["DATABASE_URL"];

if (!runtimeDatabaseUrl) {
  throw new Error("DATABASE_URL zorunludur.");
}

const appDatabaseUrl = new URL(runtimeDatabaseUrl);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const branchRepository = new BranchRepository(
  appPrisma as unknown as PrismaService,
);
const authRepository = new AuthRepository(
  appPrisma as unknown as PrismaService,
);
const rbacRepository = new RbacRepository(
  appPrisma as unknown as PrismaService,
);
const fileRepository = new FileRepository(
  appPrisma as unknown as PrismaService,
);
const controlledDrugsRepository = new ControlledDrugsRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const branchAId = randomUUID();
const branchBId = randomUUID();
const seededEntryId = randomUUID();
const correctionEntryId = randomUUID();
const userAId = randomUUID();
const userBId = randomUUID();
const fileAId = randomUUID();
const sessionAId = randomUUID();
const sessionAHash = `session-token-hash-for-rls-e2e-${randomUUID()}`;
const invitationAId = randomUUID();
const invitationAHash = `invitation-token-hash-for-rls-e2e-${randomUUID()}`;
const resetAId = randomUUID();
const resetAHash = `reset-token-hash-for-rls-e2e-${randomUUID()}`;
type TransactionClient = Prisma.TransactionClient;

/** Kısıtlı rol altında transaction-local tenant bağlamı kurar. */
async function withTenant<T>(
  tenantId: string,
  action: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
    return action(tx);
  });
}

/** Test rolüne ait grant'leri ve rolü, varsa güvenli şekilde temizler. */
async function dropTestRole(): Promise<void> {
  await adminPrisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRoleName}') THEN
        DROP OWNED BY vetniva_e2e_app;
        DROP ROLE vetniva_e2e_app;
      END IF;
    END
    $$;
  `);
}

describe("Controlled Drugs PostgreSQL RLS", () => {
  beforeAll(async () => {
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON TYPE controlled_drug_entry_type, controlled_drug_schedule, controlled_drug_unit TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON TYPE file_scan_status, file_visibility TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE branches TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE users, tenants, user_tenant_memberships TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE controlled_drug_entries TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE file_metas TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE user_sessions TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE user_invitations, password_reset_tokens TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `cd-rls-a-${tenantAId}`,
          name: "Controlled Drugs RLS Tenant A",
          country: "GB",
        },
        {
          id: tenantBId,
          slug: `cd-rls-b-${tenantBId}`,
          name: "Controlled Drugs RLS Tenant B",
          country: "GB",
        },
      ],
    });
    await adminPrisma.branch.createMany({
      data: [
        {
          id: branchAId,
          tenantId: tenantAId,
          code: `cd-rls-a-${branchAId}`,
          name: "Controlled Drugs RLS Branch A",
        },
        {
          id: branchBId,
          tenantId: tenantBId,
          code: `cd-rls-b-${branchBId}`,
          name: "Controlled Drugs RLS Branch B",
        },
      ],
    });
    await adminPrisma.user.createMany({
      data: [
        {
          id: userAId,
          email: `cd-rls-a-${userAId}@vetniva.test`,
          passwordHash: "not-used-by-rls-test",
          displayName: "Controlled Drugs RLS User A",
        },
        {
          id: userBId,
          email: `cd-rls-b-${userBId}@vetniva.test`,
          passwordHash: "not-used-by-rls-test",
          displayName: "Controlled Drugs RLS User B",
        },
      ],
    });
    await adminPrisma.userTenantMembership.createMany({
      data: [
        { userId: userAId, tenantId: tenantAId, role: "STAFF" },
        { userId: userBId, tenantId: tenantBId, role: "STAFF" },
      ],
    });
    await adminPrisma.fileMeta.create({
      data: {
        id: fileAId,
        tenantId: tenantAId,
        branchId: branchAId,
        uploaderId: userAId,
        storageKey: `tenants/${tenantAId}/files/${fileAId}`,
        originalName: "rls-test.txt",
        mimeType: "text/plain",
        sizeBytes: BigInt(1),
        checksumSha256: "a".repeat(64),
        visibility: "tenant",
      },
    });
    await adminPrisma.userSession.create({
      data: {
        id: sessionAId,
        userId: userAId,
        tokenHash: sessionAHash,
        expiresAt: new Date("2026-12-31T23:59:59.000Z"),
      },
    });
    await adminPrisma.userInvitation.create({
      data: {
        id: invitationAId,
        tenantId: tenantAId,
        email: `invite-${tenantAId}@vetniva.test`,
        role: "STAFF",
        tokenHash: invitationAHash,
        invitedBy: userAId,
        expiresAt: new Date("2026-12-31T23:59:59.000Z"),
      },
    });
    await adminPrisma.passwordResetToken.create({
      data: {
        id: resetAId,
        userId: userAId,
        tokenHash: resetAHash,
        expiresAt: new Date("2026-12-31T23:59:59.000Z"),
      },
    });
    await adminPrisma.controlledDrugEntry.create({
      data: {
        id: seededEntryId,
        tenantId: tenantAId,
        branchId: branchAId,
        entryType: "received",
        drugName: "RLS test medicine",
        schedule: "S2",
        unit: "ml",
        quantityDelta: 10,
        storageAreaId: "safe-a",
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        recordedBy: "rls-e2e",
      },
    });
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  it("tenant bağlamı yokken kayıt göstermez veya yazdırmaz", async () => {
    await expect(appPrisma.controlledDrugEntry.findMany()).resolves.toEqual([]);
    await expect(
      appPrisma.controlledDrugEntry.create({
        data: {
          tenantId: tenantAId,
          branchId: branchAId,
          entryType: "received",
          drugName: "Unauthorized write",
          schedule: "S2",
          unit: "ml",
          quantityDelta: 1,
          storageAreaId: "safe-a",
          occurredAt: new Date(),
          recordedBy: "rls-e2e",
        },
      }),
    ).rejects.toBeDefined();
  });

  it("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleIds = await withTenant(tenantAId, async (tx) => {
      const entries = await tx.controlledDrugEntry.findMany({
        orderBy: { id: "asc" },
      });
      return entries.map((entry) => entry.id);
    });
    const otherTenantIds = await withTenant(tenantBId, async (tx) => {
      const entries = await tx.controlledDrugEntry.findMany();
      return entries.map((entry) => entry.id);
    });

    expect(visibleIds).toContain(seededEntryId);
    expect(otherTenantIds).not.toContain(seededEntryId);
    expect(otherTenantIds).toEqual([]);
  });

  it("Branch repository RLS bağlamını aynı transaction içinde taşır", async () => {
    const tenantABranches = await branchRepository.list(
      { tenantId: tenantAId },
      { tenantId: tenantAId, isSuperadmin: false },
    );
    const tenantBBranches = await branchRepository.list(
      { tenantId: tenantBId },
      { tenantId: tenantBId, isSuperadmin: false },
    );

    expect(tenantABranches.map((branch) => branch.id)).toEqual([branchAId]);
    expect(tenantBBranches.map((branch) => branch.id)).toEqual([branchBId]);
  });

  it("RBAC repository RLS bağlamını aynı transaction içinde taşır", async () => {
    const tenantAMemberships = await rbacRepository.listMemberships(tenantAId, {
      tenantId: tenantAId,
      isSuperadmin: false,
    });
    const tenantBMemberships = await rbacRepository.listMemberships(tenantBId, {
      tenantId: tenantBId,
      isSuperadmin: false,
    });

    expect(tenantAMemberships.map((membership) => membership.userId)).toEqual([
      userAId,
    ]);
    expect(tenantBMemberships.map((membership) => membership.userId)).toEqual([
      userBId,
    ]);
  });

  it("File repository RLS bağlamını aynı transaction içinde taşır", async () => {
    const tenantAFiles = await fileRepository.list({
      tenantId: tenantAId,
      page: 1,
      pageSize: 20,
      includeArchived: false,
    });
    const tenantBFiles = await fileRepository.list({
      tenantId: tenantBId,
      page: 1,
      pageSize: 20,
      includeArchived: false,
    });

    expect(tenantAFiles.items.map((file) => file.id)).toEqual([fileAId]);
    expect(tenantBFiles.items).toEqual([]);
  });

  it("Auth repository token lookup ve session mutation bağlamını taşır", async () => {
    const lookedUp = await authRepository.findSessionByTokenHash(sessionAHash);
    const ownerSessions = await authRepository.listActiveSessions(userAId);
    const otherSessions = await authRepository.listActiveSessions(userBId);

    expect(lookedUp?.id).toBe(sessionAId);
    expect(ownerSessions.map((session) => session.id)).toEqual([sessionAId]);
    expect(otherSessions).toEqual([]);

    await authRepository.revokeSession(sessionAId, userAId, "rls_e2e");
    expect(await authRepository.listActiveSessions(userAId)).toEqual([]);
  });

  it("Auth login üyelik ve varsayılan şube bağlamını aynı transaction'da çözer", async () => {
    const membership =
      await authRepository.findActiveMembershipWithTenant(userAId);
    const branch = await authRepository.findDefaultActiveBranch(tenantAId);
    const accessibleBranch = await authRepository.findActiveBranchForUser(
      userAId,
      branchAId,
      false,
    );
    const foreignBranch = await authRepository.findActiveBranchForUser(
      userAId,
      branchBId,
      false,
    );

    expect(membership).toMatchObject({
      tenantId: tenantAId,
      role: "STAFF",
      tenant: { id: tenantAId },
    });
    expect(branch).toEqual({ id: branchAId });
    expect(accessibleBranch).toMatchObject({
      id: branchAId,
      tenantId: tenantAId,
    });
    expect(foreignBranch).toBeNull();
  });

  it("Auth invitation ve reset tokenları yalnız hash bağlamıyla açar", async () => {
    const invitation =
      await authRepository.findInvitationByTokenHash(invitationAHash);
    const reset = await authRepository.findPasswordResetByTokenHash(resetAHash);

    expect(invitation?.id).toBe(invitationAId);
    expect(reset?.id).toBe(resetAId);
    await expect(
      authRepository.findInvitationByTokenHash("unknown-invitation-hash"),
    ).resolves.toBeNull();
    await expect(
      authRepository.findPasswordResetByTokenHash("unknown-reset-hash"),
    ).resolves.toBeNull();

    await authRepository.updateInvitation(tenantAId, invitationAId, {
      status: "accepted",
      acceptedAt: new Date(),
    });
    await authRepository.markPasswordResetUsed(resetAId, userAId);

    expect(
      await adminPrisma.userInvitation.findUnique({
        where: { id: invitationAId },
        select: { status: true },
      }),
    ).toEqual({ status: "accepted" });
    const resetAfterMutation = await adminPrisma.passwordResetToken.findUnique({
      where: { id: resetAId },
      select: { usedAt: true },
    });
    expect(resetAfterMutation?.usedAt).toBeInstanceOf(Date);
  });

  it("append-only correction kaydı runtime RLS yolunda stok bakiyesini tersine çevirir", async () => {
    await withTenant(tenantAId, async (tx) =>
      tx.controlledDrugEntry.create({
        data: {
          id: correctionEntryId,
          tenantId: tenantAId,
          branchId: branchAId,
          entryType: "correction",
          drugName: "RLS test medicine",
          schedule: "S2",
          unit: "ml",
          quantityDelta: -10,
          storageAreaId: "safe-a",
          occurredAt: new Date("2026-08-01T00:00:00.000Z"),
          recordedBy: "rls-e2e",
          correctsEntryId: seededEntryId,
        },
      }),
    );

    await expect(
      controlledDrugsRepository.computeStockBalances(tenantAId),
    ).resolves.toEqual([
      expect.objectContaining({
        drugName: "RLS test medicine",
        currentQuantity: 0,
      }),
    ]);

    await expect(
      withTenant(tenantAId, async (tx) =>
        tx.controlledDrugEntry.create({
          data: {
            id: randomUUID(),
            tenantId: tenantAId,
            branchId: branchAId,
            entryType: "correction",
            drugName: "RLS test medicine",
            schedule: "S2",
            unit: "ml",
            quantityDelta: -10,
            storageAreaId: "safe-a",
            occurredAt: new Date("2026-08-01T00:00:00.000Z"),
            recordedBy: "rls-e2e",
            correctsEntryId: seededEntryId,
          },
        }),
      ),
    ).rejects.toBeDefined();
  });

  it("tenant bağlamı doğru olsa dahi append-only trigger UPDATE'i reddeder", async () => {
    await expect(
      withTenant(tenantAId, async (tx) =>
        tx.controlledDrugEntry.update({
          where: { id: seededEntryId },
          data: { notes: "mutation must be rejected" },
        }),
      ),
    ).rejects.toBeDefined();
  });
});
