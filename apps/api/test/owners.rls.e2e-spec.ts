/**
 * @file Owner PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle `owners` tablosunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Test rolü yalnızca geçici E2E veritabanında oluşturulur.
 *
 * Not: `owners` tablosunda fiziksel DELETE için append-only trigger
 * yoktur (RLS üzerinden tenant_id izolasyonu sağlanır); bu nedenle
 * "append-only DELETE reddi" senaryosu yerine cross-tenant archive
 * reddi ve yetki-grant doğrulaması yazılır.
 *
 * DB yoksa (DATABASE_MIGRATOR_URL veya DATABASE_URL tanımsız) tüm
 * senaryolar `itDb.skip` ile geçilir; lint + type-check gate'lerini
 * kırmaz.
 *
 * @since GOAL-017 (FAZ-12) cross-tenant RLS coverage — 5 modül (owner)
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OwnersRepository } from "../src/modules/owners/owners.repository.js";

import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Skip guard — DB yoksa lint/type-check/test gate'lerini kırmadan skip.
// ---------------------------------------------------------------------------

const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];
const runtimeDatabaseUrl = process.env["DATABASE_URL"];
const skip = !migratorDatabaseUrl || !runtimeDatabaseUrl;
const itDb = skip ? it.skip : it;

if (skip) {
  console.warn(
    "[owners.rls] DATABASE_MIGRATOR_URL/DATABASE_URL yok; 10 senaryo skip edilecek.",
  );
}

// ---------------------------------------------------------------------------
// Prisma client kurulumu (admin + kısıtlı app rolü).
// ---------------------------------------------------------------------------

const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl ?? STUB_DATABASE_URL } },
});
const appRoleName = "vetniva_e2e_owners_app";

const appDatabaseUrl = new URL(runtimeDatabaseUrl ?? STUB_DATABASE_URL);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-owners-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const ownersRepository = new OwnersRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const seededOwnerAId = randomUUID();
const seededOwnerBId = randomUUID();
const foreignOwnerId = randomUUID();
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
        DROP OWNED BY ${appRoleName};
        DROP ROLE ${appRoleName};
      END IF;
    END
    $$;
  `);
}

describe("Owner PostgreSQL RLS", () => {
  beforeAll(async () => {
    if (skip) return;
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-owners-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE owners TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE tenants TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `ow-rls-a-${tenantAId}`,
          name: "Owner RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `ow-rls-b-${tenantBId}`,
          name: "Owner RLS Tenant B",
          country: "TR",
        },
      ],
    });
    await adminPrisma.owner.createMany({
      data: [
        {
          id: seededOwnerAId,
          tenantId: tenantAId,
          firstName: "Ayşe",
          lastName: "Yılmaz",
          phone: `+90555100${randomUUID().slice(0, 4)}`,
          email: "ayse@vetniva.test",
        },
        {
          id: seededOwnerBId,
          tenantId: tenantBId,
          firstName: "Mehmet",
          lastName: "Kaya",
          phone: `+90555200${randomUUID().slice(0, 4)}`,
          email: "mehmet@vetniva.test",
        },
        {
          id: foreignOwnerId,
          tenantId: tenantBId,
          firstName: "Cross",
          lastName: "Probe",
          phone: `+90555300${randomUUID().slice(0, 4)}`,
        },
      ],
    });
  });

  afterAll(async () => {
    if (skip) return;
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  itDb(
    "tenant bağlamı yokken owners satırı göstermez veya yazdırmaz",
    async () => {
      expect(await appPrisma.owner.findMany()).toEqual([]);
      await expect(
        appPrisma.owner.create({
          data: {
            id: randomUUID(),
            tenantId: tenantAId,
            firstName: "Unauthorized",
            lastName: "Write",
            phone: `+90555999${randomUUID().slice(0, 4)}`,
          },
        }),
      ).rejects.toBeDefined();
    },
  );

  itDb("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleA = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.owner.findMany({ orderBy: { firstName: "asc" } });
      return rows.map((r) => r.id);
    });
    const visibleB = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.owner.findMany({ orderBy: { firstName: "asc" } });
      return rows.map((r) => r.id);
    });

    expect(visibleA).toEqual([seededOwnerAId]);
    expect(visibleB.sort()).toEqual([seededOwnerBId, foreignOwnerId].sort());
    expect(visibleA).not.toContain(seededOwnerBId);
    expect(visibleB).not.toContain(seededOwnerAId);
  });

  itDb(
    "Repository findById tenant-scoped: cross-tenant null döner",
    async () => {
      const inTenantA = await ownersRepository.findPersistedById(tenantAId, seededOwnerAId);
      const inTenantBWithForeignId = await ownersRepository.findPersistedById(
        tenantBId,
        seededOwnerAId,
      );
      const inTenantAWithBTenantId = await ownersRepository.findPersistedById(
        tenantAId,
        seededOwnerBId,
      );

      expect(inTenantA?.id).toBe(seededOwnerAId);
      expect(inTenantBWithForeignId).toBeNull();
      expect(inTenantAWithBTenantId).toBeNull();
    },
  );

  itDb(
    "Repository findByPhone tenant-scoped: cross-tenant null döner",
    async () => {
      const adminRow = await adminPrisma.owner.findUnique({
        where: { id: seededOwnerAId },
      });
      const aPhone = adminRow?.phone ?? "";
      const aRow = await ownersRepository.findPersistedByPhone(tenantAId, aPhone);
      const bSeesA = await ownersRepository.findPersistedByPhone(tenantBId, aPhone);

      expect(aRow?.id).toBe(seededOwnerAId);
      expect(bSeesA).toBeNull();
    },
  );

  itDb(
    "Repository search tenant-scoped: doğru tenant kendi kayıtlarını sayar",
    async () => {
      const aResults = await ownersRepository.searchPersisted(tenantAId, {
        limit: 20,
        offset: 0,
      });
      const bResults = await ownersRepository.searchPersisted(tenantBId, {
        limit: 20,
        offset: 0,
      });

      expect(aResults.items.map((r) => r.id)).toEqual([seededOwnerAId]);
      expect(aResults.total).toBe(1);
      expect(bResults.items.map((r) => r.id).sort()).toEqual(
        [seededOwnerBId, foreignOwnerId].sort(),
      );
      expect(bResults.total).toBe(2);
    },
  );

  itDb(
    "Repository search search filtresi yalnızca kendi tenant'ında eşleşir",
    async () => {
      const aResults = await ownersRepository.searchPersisted(tenantAId, {
        limit: 20,
        offset: 0,
        search: "Ayşe",
      });
      const bResults = await ownersRepository.searchPersisted(tenantBId, {
        limit: 20,
        offset: 0,
        search: "Ayşe",
      });
      const bSeesOwn = await ownersRepository.searchPersisted(tenantBId, {
        limit: 20,
        offset: 0,
        search: "Mehmet",
      });

      expect(aResults.items.map((r) => r.id)).toEqual([seededOwnerAId]);
      expect(bResults.items).toEqual([]);
      expect(bSeesOwn.items.map((r) => r.id)).toEqual([seededOwnerBId]);
    },
  );

  itDb(
    "Repository insert kendi tenant context'inde yeni kayıt ekler",
    async () => {
      const newId = randomUUID();
      const inserted = await ownersRepository.persist({
        id: newId,
        tenantId: tenantAId,
        firstName: "Inserted",
        lastName: "ViaRLS",
        phone: `+90555444${randomUUID().slice(0, 4)}`,
        email: null,
        taxId: null,
        address: null,
        consents: { kvkk: true, marketing: false },
        createdAt: new Date().toISOString(),
        archivedAt: null,
      });

      expect(inserted.tenantId).toBe(tenantAId);
      expect(inserted.id).toBe(newId);
      expect(inserted.firstName).toBe("Inserted");

      const visible = await withTenant(tenantAId, async (tx) =>
        tx.owner.findUnique({ where: { id: newId } }),
      );
      const invisible = await withTenant(tenantBId, async (tx) =>
        tx.owner.findUnique({ where: { id: newId } }),
      );

      expect(visible?.id).toBe(newId);
      expect(invisible).toBeNull();
    },
  );

  itDb("Repository update (in-memory) doğru tenant'ta başarılı", async () => {
    const updated = ownersRepository.update({
      id: seededOwnerAId,
      tenantId: tenantAId,
      firstName: "Ayşe",
      lastName: "Güncellendi",
      phone: "+905551000000",
      email: "ayse@vetniva.test",
      taxId: null,
      address: null,
      consents: { kvkk: true, marketing: false },
      createdAt: new Date().toISOString(),
      archivedAt: null,
    });
    expect(updated.id).toBe(seededOwnerAId);
    expect(updated.lastName).toBe("Güncellendi");
  });

  itDb(
    "Repository archive cross-tenant: P2025/null ile sonuçlanır",
    async () => {
      // archivePersisted async (Prisma path) — RLS USING clause satırı
      // göstermediği için updateMany 0 satır etkiler ve null döner.
      const result = await ownersRepository.archivePersisted(
        tenantAId,
        seededOwnerBId,
        new Date().toISOString(),
      );
      expect(result).toBeNull();

      const untouched = await adminPrisma.owner.findUnique({
        where: { id: seededOwnerBId },
      });
      expect(untouched?.archivedAt).toBeNull();
    },
  );

  itDb(
    "App role yalnızca SELECT/INSERT/UPDATE yetkisine sahiptir",
    async () => {
      const privs = await adminPrisma.$queryRawUnsafe<
        Array<{ privilege_type: string }>
      >(`
      SELECT privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name = 'owners'
      ORDER BY privilege_type;
    `);
      const types = privs.map((p) => p.privilege_type);
      expect(types).toEqual(["INSERT", "SELECT", "UPDATE"]);
    },
  );
});
