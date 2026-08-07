/**
 * @file Vaccination (aşı uygulama) PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle `vaccine_applications` + `vaccine_protocols` tablolarını
 * doğrular. Tenant bağlamı yokken satır okunamaz veya yazılamaz; doğru
 * bağlam yalnızca ilgili tenant'ın satırlarını açar. Test rolü yalnızca
 * geçici E2E veritabanında oluşturulur.
 *
 * Not: `vaccine_applications` tablosunda fiziksel DELETE için append-only
 * trigger yoktur (RLS üzerinden tenant_id izolasyonu sağlanır); klinik
 * düzeltme `amended` durumu, iptal `cancelled` durumu ile yapılır. Bu
 * nedenle "append-only DELETE/UPDATE reddi" senaryoları yerine cross-tenant
 * update reddi ve yetki-grant doğrulaması yazılır.
 *
 * DB yoksa (DATABASE_MIGRATOR_URL veya DATABASE_URL tanımsız) tüm
 * senaryolar `itDb.skip` ile geçilir; lint + type-check gate'lerini
 * kırmaz.
 *
 * @since GOAL-017 (FAZ-12) cross-tenant RLS coverage — 5 modül (vaccination)
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { VaccineApplicationsRepository } from "../src/modules/vaccines/vaccine-applications.repository.js";

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
    "[vaccinations.rls] DATABASE_MIGRATOR_URL/DATABASE_URL yok; 11 senaryo skip edilecek.",
  );
}

// ---------------------------------------------------------------------------
// Prisma client kurulumu (admin + kısıtlı app rolü).
// ---------------------------------------------------------------------------

const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl ?? STUB_DATABASE_URL } },
});
const appRoleName = "vetniva_e2e_vaccinations_app";

const appDatabaseUrl = new URL(runtimeDatabaseUrl ?? STUB_DATABASE_URL);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-vaccinations-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const vaccinationsRepository = new VaccineApplicationsRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const ownerAId = randomUUID();
const ownerBId = randomUUID();
const patientAId = randomUUID();
const patientBId = randomUUID();
const protocolAId = `vcpr-rls-a-${randomUUID().slice(0, 8)}`;
const protocolBId = `vcpr-rls-b-${randomUUID().slice(0, 8)}`;
const seededApplicationAId = `vaca-rls-a-${randomUUID().slice(0, 8)}`;
const seededApplicationBId = `vaca-rls-b-${randomUUID().slice(0, 8)}`;
const foreignApplicationId = `vaca-rls-fb-${randomUUID().slice(0, 8)}`;
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

describe("Vaccination PostgreSQL RLS", () => {
  beforeAll(async () => {
    if (skip) return;
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-vaccinations-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE vaccine_applications, vaccine_protocols, vaccine_reminders TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE tenants, owners, patients, users TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `vc-rls-a-${tenantAId}`,
          name: "Vaccination RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `vc-rls-b-${tenantBId}`,
          name: "Vaccination RLS Tenant B",
          country: "TR",
        },
      ],
    });
    await adminPrisma.owner.createMany({
      data: [
        {
          id: ownerAId,
          tenantId: tenantAId,
          firstName: "Owner",
          lastName: "A",
          phone: `+90555111${randomUUID().slice(0, 4)}`,
        },
        {
          id: ownerBId,
          tenantId: tenantBId,
          firstName: "Owner",
          lastName: "B",
          phone: `+90555222${randomUUID().slice(0, 4)}`,
        },
      ],
    });
    await adminPrisma.patient.createMany({
      data: [
        {
          id: patientAId,
          tenantId: tenantAId,
          ownerId: ownerAId,
          name: "Patient A",
          species: "dog",
          gender: "female",
          neutered: false,
        },
        {
          id: patientBId,
          tenantId: tenantBId,
          ownerId: ownerBId,
          name: "Patient B",
          species: "cat",
          gender: "male",
          neutered: true,
        },
      ],
    });
    await adminPrisma.vaccineProtocolRecord.createMany({
      data: [
        {
          id: protocolAId,
          tenantId: tenantAId,
          name: "Tenant A Rabies Protocol",
          species: "dog",
          category: "core",
          steps: [{ step: 1, offsetDays: 0, vaccineName: "Rabies" }],
          totalDurationMonths: 12,
          isCore: true,
          createdBy: "rls-e2e",
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
        {
          id: protocolBId,
          tenantId: tenantBId,
          name: "Tenant B Rabies Protocol",
          species: "dog",
          category: "core",
          steps: [{ step: 1, offsetDays: 0, vaccineName: "Rabies" }],
          totalDurationMonths: 12,
          isCore: true,
          createdBy: "rls-e2e",
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
    });
    await adminPrisma.vaccineApplicationRecord.createMany({
      data: [
        {
          id: seededApplicationAId,
          tenantId: tenantAId,
          patientId: patientAId,
          protocolId: protocolAId,
          lot: { lotNumber: "LOT-A-001", stockProductId: "PROD-A" },
          administeredBy: "rls-e2e",
          applicationDate: new Date("2026-08-01T10:00:00.000Z"),
          nextDueDate: null,
          notes: "Tenant A primary dose",
          status: "active",
          createdBy: "rls-e2e",
          createdAt: new Date("2026-08-01T10:00:00.000Z"),
          updatedAt: new Date("2026-08-01T10:00:00.000Z"),
          stockMovementIds: "[]",
        },
        {
          id: seededApplicationBId,
          tenantId: tenantBId,
          patientId: patientBId,
          protocolId: protocolBId,
          lot: { lotNumber: "LOT-B-001", stockProductId: "PROD-B" },
          administeredBy: "rls-e2e",
          applicationDate: new Date("2026-08-02T11:00:00.000Z"),
          nextDueDate: null,
          notes: "Tenant B primary dose",
          status: "active",
          createdBy: "rls-e2e",
          createdAt: new Date("2026-08-02T11:00:00.000Z"),
          updatedAt: new Date("2026-08-02T11:00:00.000Z"),
          stockMovementIds: "[]",
        },
        {
          id: foreignApplicationId,
          tenantId: tenantBId,
          patientId: patientBId,
          protocolId: protocolBId,
          lot: { lotNumber: "LOT-B-002", stockProductId: "PROD-B" },
          administeredBy: "rls-e2e",
          applicationDate: new Date("2026-08-03T12:00:00.000Z"),
          nextDueDate: null,
          notes: "Tenant B cross-tenant probe",
          status: "active",
          createdBy: "rls-e2e",
          createdAt: new Date("2026-08-03T12:00:00.000Z"),
          updatedAt: new Date("2026-08-03T12:00:00.000Z"),
          stockMovementIds: "[]",
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
    "tenant bağlamı yokken vaccine_applications satırı göstermez veya yazdırmaz",
    async () => {
      expect(await appPrisma.vaccineApplicationRecord.findMany()).toEqual([]);
      await expect(
        appPrisma.vaccineApplicationRecord.create({
          data: {
            id: `vaca-unauth-${randomUUID().slice(0, 8)}`,
            tenantId: tenantAId,
            patientId: patientAId,
            protocolId: protocolAId,
            lot: { lotNumber: "UNAUTH", stockProductId: "PROD-A" },
            administeredBy: "rls-e2e",
            applicationDate: new Date(),
            nextDueDate: null,
            notes: "Unauthorized write",
            status: "active",
            createdBy: "rls-e2e",
            createdAt: new Date(),
            updatedAt: new Date(),
            stockMovementIds: "[]",
          },
        }),
      ).rejects.toBeDefined();
    },
  );

  itDb("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleA = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.vaccineApplicationRecord.findMany({
        orderBy: { id: "asc" },
      });
      return rows.map((r) => r.id);
    });
    const visibleB = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.vaccineApplicationRecord.findMany({
        orderBy: { id: "asc" },
      });
      return rows.map((r) => r.id);
    });

    expect(visibleA).toEqual([seededApplicationAId]);
    expect(visibleB.sort()).toEqual(
      [seededApplicationBId, foreignApplicationId].sort(),
    );
    expect(visibleA).not.toContain(seededApplicationBId);
    expect(visibleB).not.toContain(seededApplicationAId);
  });

  itDb(
    "Repository persistedById tenant-scoped: cross-tenant null döner",
    async () => {
      const inTenantA = await vaccinationsRepository.persistedById(
        tenantAId,
        seededApplicationAId,
      );
      const inTenantBWithForeignId = await vaccinationsRepository.persistedById(
        tenantBId,
        seededApplicationAId,
      );
      const inTenantAWithBTenantId = await vaccinationsRepository.persistedById(
        tenantAId,
        seededApplicationBId,
      );

      expect(inTenantA?.id).toBe(seededApplicationAId);
      expect(inTenantBWithForeignId).toBeNull();
      expect(inTenantAWithBTenantId).toBeNull();
    },
  );

  itDb(
    "Repository search tenant-scoped: doğru tenant kendi kayıtlarını sayar",
    async () => {
      const aResults = vaccinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
      });
      const bResults = vaccinationsRepository.search(tenantBId, {
        limit: 20,
        offset: 0,
      });

      expect(aResults.items.map((r) => r.id)).toEqual([seededApplicationAId]);
      expect(aResults.total).toBe(1);
      expect(bResults.items.map((r) => r.id).sort()).toEqual(
        [seededApplicationBId, foreignApplicationId].sort(),
      );
      expect(bResults.total).toBe(2);
    },
  );

  itDb(
    "Repository search patientId filtresi cross-tenant izolasyonu korur",
    async () => {
      const aOnBPatient = vaccinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        patientId: patientBId,
      });
      const aOnAPatient = vaccinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        patientId: patientAId,
      });

      expect(aOnBPatient.items).toEqual([]);
      expect(aOnAPatient.items.map((r) => r.id)).toEqual([
        seededApplicationAId,
      ]);
    },
  );

  itDb(
    "Repository listByPatient tenant-scoped: cross-tenant null/boş döner",
    async () => {
      const aOnA = vaccinationsRepository.listByPatient(
        tenantAId,
        patientAId,
        50,
      );
      const aOnB = vaccinationsRepository.listByPatient(
        tenantAId,
        patientBId,
        50,
      );

      expect(aOnA.map((r) => r.id)).toEqual([seededApplicationAId]);
      expect(aOnB).toEqual([]);
    },
  );

  itDb(
    "Repository search protocolId filtresi yalnızca kendi tenant'ında eşleşir",
    async () => {
      const aOnAProtocol = vaccinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        protocolId: protocolAId,
      });
      const aOnBProtocol = vaccinationsRepository.search(tenantAId, {
        limit: 20,
        offset: 0,
        protocolId: protocolBId,
      });

      expect(aOnAProtocol.items.map((r) => r.id)).toEqual([
        seededApplicationAId,
      ]);
      expect(aOnBProtocol.items).toEqual([]);
    },
  );

  itDb(
    "Repository insert kendi tenant context'inde yeni kayıt ekler",
    async () => {
      const newId = `vaca-ins-${randomUUID().slice(0, 8)}`;
      const inserted = await vaccinationsRepository.persist({
        id: newId,
        tenantId: tenantAId,
        patientId: patientAId,
        protocolId: protocolAId,
        lot: {
          lot: "LOT-INS-001",
          expiryDate: "2026-12-31",
          stockProductId: "PROD-A",
        },
        dose: { amount: 1, unit: "ml" },
        administeredBy: "rls-e2e",
        applicationDate: new Date().toISOString(),
        nextDueDate: null,
        notes: "Inserted via RLS test",
        status: "active",
        createdBy: "rls-e2e",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        amendedAt: null,
        amendedBy: null,
        amendedReason: null,
        cancelledAt: null,
        cancellationReason: null,
        stockMovementIds: [],
      });

      expect(inserted.tenantId).toBe(tenantAId);
      expect(inserted.id).toBe(newId);
      expect(inserted.notes).toBe("Inserted via RLS test");

      const visible = await withTenant(tenantAId, async (tx) =>
        tx.vaccineApplicationRecord.findUnique({ where: { id: newId } }),
      );
      const invisible = await withTenant(tenantBId, async (tx) =>
        tx.vaccineApplicationRecord.findUnique({ where: { id: newId } }),
      );

      expect(visible?.id).toBe(newId);
      expect(invisible).toBeNull();
    },
  );

  itDb(
    "Repository persistedUpdate doğru tenant'ta başarılı (cancel)",
    async () => {
      const updated = await vaccinationsRepository.persistedUpdate(
        tenantAId,
        seededApplicationAId,
        {
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
          cancellationReason: "RLS test cancel",
          updatedAt: new Date().toISOString(),
        },
      );
      expect(updated?.id).toBe(seededApplicationAId);
      expect(updated?.status).toBe("cancelled");
      expect(updated?.cancellationReason).toBe("RLS test cancel");
    },
  );

  itDb(
    "Repository persistedUpdate cross-tenant: null ile sonuçlanır",
    async () => {
      const result = await vaccinationsRepository.persistedUpdate(
        tenantAId,
        seededApplicationBId,
        {
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
          cancellationReason: "Cross-tenant attack",
          updatedAt: new Date().toISOString(),
        },
      );
      expect(result).toBeNull();

      const untouched = await adminPrisma.vaccineApplicationRecord.findUnique({
        where: { id: seededApplicationBId },
      });
      expect(untouched?.status).toBe("active");
      expect(untouched?.cancellationReason).toBeNull();
    },
  );

  itDb(
    "App role yalnızca SELECT/INSERT/UPDATE yetkisine sahiptir",
    async () => {
      const privs = await adminPrisma.$queryRawUnsafe<
        Array<{ privilege_type: string; table_name: string }>
      >(`
      SELECT privilege_type, table_name
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name IN ('vaccine_applications', 'vaccine_protocols')
      ORDER BY table_name, privilege_type;
    `);
      const appPrivs = privs
        .filter((p) => p.table_name === "vaccine_applications")
        .map((p) => p.privilege_type);
      const protoPrivs = privs
        .filter((p) => p.table_name === "vaccine_protocols")
        .map((p) => p.privilege_type);
      expect(appPrivs).toEqual(["INSERT", "SELECT", "UPDATE"]);
      expect(protoPrivs).toEqual(["INSERT", "SELECT", "UPDATE"]);
    },
  );
});
