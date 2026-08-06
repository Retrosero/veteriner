/**
 * @file Prescription PostgreSQL RLS E2E testi.
 * @module apps/api/test
 * @description Bu test, uygulama sahibi/superuser hesabı yerine kısıtlı bir
 * PostgreSQL rolüyle `prescriptions` tablosunu doğrular. Tenant bağlamı yokken
 * satır okunamaz veya yazılamaz; doğru bağlam yalnızca ilgili tenant'ın
 * satırlarını açar. Test rolü yalnızca geçici E2E veritabanında oluşturulur.
 *
 * Not: `prescriptions` tablosunda fiziksel DELETE/UPDATE için append-only
 * trigger yoktur (RLS üzerinden tenant_id izolasyonu sağlanır); klinik
 * iptal `cancelled` durumu ile yapılır. Bu nedenle "append-only
 * DELETE/UPDATE reddi" senaryoları yerine cross-tenant update reddi ve
 * yetki-grant doğrulaması yazılır.
 *
 * DB yoksa (DATABASE_MIGRATOR_URL veya DATABASE_URL tanımsız) tüm
 * senaryolar `itDb.skip` ile geçilir; lint + type-check gate'lerini
 * kırmaz.
 *
 * @since GOAL-017 (FAZ-12) cross-tenant RLS coverage — 5 modül (prescription)
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrescriptionsRepository } from "../src/modules/prescriptions/prescriptions.repository.js";

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
    "[prescriptions.rls] DATABASE_MIGRATOR_URL/DATABASE_URL yok; 10 senaryo skip edilecek.",
  );
}

// ---------------------------------------------------------------------------
// Prisma client kurulumu (admin + kısıtlı app rolü).
// ---------------------------------------------------------------------------

const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";

const adminPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl ?? STUB_DATABASE_URL } },
});
const appRoleName = "vetniva_e2e_prescriptions_app";

const appDatabaseUrl = new URL(runtimeDatabaseUrl ?? STUB_DATABASE_URL);
appDatabaseUrl.username = appRoleName;
appDatabaseUrl.password = "vetniva-e2e-prescriptions-app-password";
const appPrisma = new PrismaClient({
  datasources: { db: { url: appDatabaseUrl.toString() } },
});
const prescriptionsRepository = new PrescriptionsRepository(
  appPrisma as unknown as PrismaService,
);

const tenantAId = randomUUID();
const tenantBId = randomUUID();
const ownerAId = randomUUID();
const ownerBId = randomUUID();
const patientAId = randomUUID();
const patientBId = randomUUID();
const vetAId = randomUUID();
const vetBId = randomUUID();
const examAId = `exam-rls-a-${randomUUID().slice(0, 8)}`;
const examBId = `exam-rls-b-${randomUUID().slice(0, 8)}`;
const seededPrescriptionAId = `prsc-rls-a-${randomUUID().slice(0, 8)}`;
const seededPrescriptionBId = `prsc-rls-b-${randomUUID().slice(0, 8)}`;
const foreignPrescriptionId = `prsc-rls-fb-${randomUUID().slice(0, 8)}`;
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

describe("Prescription PostgreSQL RLS", () => {
  beforeAll(async () => {
    if (skip) return;
    await dropTestRole();
    await adminPrisma.$executeRawUnsafe(
      `CREATE ROLE ${appRoleName} LOGIN PASSWORD 'vetniva-e2e-prescriptions-app-password' NOSUPERUSER NOBYPASSRLS`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE ON TABLE prescriptions, prescription_items TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SEQUENCE prescription_items_id_seq TO ${appRoleName}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `GRANT SELECT ON TABLE tenants, owners, patients, users, examinations, examination_amends TO ${appRoleName}`,
    );

    await adminPrisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          slug: `pr-rls-a-${tenantAId}`,
          name: "Prescription RLS Tenant A",
          country: "TR",
        },
        {
          id: tenantBId,
          slug: `pr-rls-b-${tenantBId}`,
          name: "Prescription RLS Tenant B",
          country: "TR",
        },
      ],
    });
    await adminPrisma.user.createMany({
      data: [
        {
          id: vetAId,
          email: `vet-a-${vetAId}@vetniva.test`,
          passwordHash: "not-used",
          displayName: "Vet A",
        },
        {
          id: vetBId,
          email: `vet-b-${vetBId}@vetniva.test`,
          passwordHash: "not-used",
          displayName: "Vet B",
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
    await adminPrisma.examination.createMany({
      data: [
        {
          id: examAId,
          tenantId: tenantAId,
          patientId: patientAId,
          veterinarianId: vetAId,
          status: "completed",
          type: "general",
          chiefComplaint: "Tenant A exam",
          startedAt: new Date("2026-08-01T09:00:00.000Z"),
          completedAt: new Date("2026-08-01T09:30:00.000Z"),
          signedAt: null,
          signedBy: null,
          createdAt: new Date("2026-08-01T09:00:00.000Z"),
          updatedAt: new Date("2026-08-01T09:30:00.000Z"),
        },
        {
          id: examBId,
          tenantId: tenantBId,
          patientId: patientBId,
          veterinarianId: vetBId,
          status: "completed",
          type: "general",
          chiefComplaint: "Tenant B exam",
          startedAt: new Date("2026-08-02T10:00:00.000Z"),
          completedAt: new Date("2026-08-02T10:30:00.000Z"),
          signedAt: null,
          signedBy: null,
          createdAt: new Date("2026-08-02T10:00:00.000Z"),
          updatedAt: new Date("2026-08-02T10:30:00.000Z"),
        },
      ],
    });
    await adminPrisma.prescriptionRecord.createMany({
      data: [
        {
          id: seededPrescriptionAId,
          tenantId: tenantAId,
          examinationId: examAId,
          patientId: patientAId,
          veterinarianId: vetAId,
          notes: "Tenant A prescription",
          status: "active",
          prescribedAt: new Date("2026-08-01T10:00:00.000Z"),
          expiresAt: new Date("2026-09-01T10:00:00.000Z"),
          dispensedAt: null,
          dispensedBy: null,
          cancelReason: null,
          createdAt: new Date("2026-08-01T10:00:00.000Z"),
          updatedAt: new Date("2026-08-01T10:00:00.000Z"),
        },
        {
          id: seededPrescriptionBId,
          tenantId: tenantBId,
          examinationId: examBId,
          patientId: patientBId,
          veterinarianId: vetBId,
          notes: "Tenant B prescription",
          status: "active",
          prescribedAt: new Date("2026-08-02T11:00:00.000Z"),
          expiresAt: new Date("2026-09-02T11:00:00.000Z"),
          dispensedAt: null,
          dispensedBy: null,
          cancelReason: null,
          createdAt: new Date("2026-08-02T11:00:00.000Z"),
          updatedAt: new Date("2026-08-02T11:00:00.000Z"),
        },
        {
          id: foreignPrescriptionId,
          tenantId: tenantBId,
          examinationId: examBId,
          patientId: patientBId,
          veterinarianId: vetBId,
          notes: "Tenant B cross-tenant probe",
          status: "active",
          prescribedAt: new Date("2026-08-03T12:00:00.000Z"),
          expiresAt: new Date("2026-09-03T12:00:00.000Z"),
          dispensedAt: null,
          dispensedBy: null,
          cancelReason: null,
          createdAt: new Date("2026-08-03T12:00:00.000Z"),
          updatedAt: new Date("2026-08-03T12:00:00.000Z"),
        },
      ],
    });
    // Reçetelere en az 1 kalem ekle (FK CASCADE ama manual oluşturma daha
    // güvenli; burada sadece varlık kanıtı yeterli). prescription_items
    // BIGSERIAL primary key kullandığı için Prisma createMany üretmez;
    // tek tek create çağrısı yapılır.
    await adminPrisma.prescriptionItemRecord.create({
      data: {
        prescriptionId: seededPrescriptionAId,
        drugName: "Drug A",
        dosage: "5mg",
        frequency: "twice_daily",
        durationDays: 7,
        route: "oral",
        instructions: null,
      },
    });
    await adminPrisma.prescriptionItemRecord.create({
      data: {
        prescriptionId: seededPrescriptionBId,
        drugName: "Drug B",
        dosage: "10mg",
        frequency: "once_daily",
        durationDays: 5,
        route: "oral",
        instructions: null,
      },
    });
    await adminPrisma.prescriptionItemRecord.create({
      data: {
        prescriptionId: foreignPrescriptionId,
        drugName: "Drug FB",
        dosage: "2mg",
        frequency: "as_needed",
        durationDays: 3,
        route: "topical",
        instructions: null,
      },
    });
  });

  afterAll(async () => {
    if (skip) return;
    await appPrisma.$disconnect();
    await dropTestRole();
    await adminPrisma.$disconnect();
  });

  itDb("tenant bağlamı yokken prescriptions satırı göstermez veya yazdırmaz", async () => {
    expect(await appPrisma.prescriptionRecord.findMany()).toEqual([]);
    await expect(
      appPrisma.prescriptionRecord.create({
        data: {
          id: `prsc-unauth-${randomUUID().slice(0, 8)}`,
          tenantId: tenantAId,
          examinationId: examAId,
          patientId: patientAId,
          veterinarianId: vetAId,
          notes: "Unauthorized write",
          status: "active",
          prescribedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          dispensedAt: null,
          dispensedBy: null,
          cancelReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toBeDefined();
  });

  itDb("doğru tenant bağlamı yalnızca kendi kaydını açar", async () => {
    const visibleA = await withTenant(tenantAId, async (tx) => {
      const rows = await tx.prescriptionRecord.findMany({
        orderBy: { id: "asc" },
      });
      return rows.map((r) => r.id);
    });
    const visibleB = await withTenant(tenantBId, async (tx) => {
      const rows = await tx.prescriptionRecord.findMany({
        orderBy: { id: "asc" },
      });
      return rows.map((r) => r.id);
    });

    expect(visibleA).toEqual([seededPrescriptionAId]);
    expect(visibleB.sort()).toEqual(
      [seededPrescriptionBId, foreignPrescriptionId].sort(),
    );
    expect(visibleA).not.toContain(seededPrescriptionBId);
    expect(visibleB).not.toContain(seededPrescriptionAId);
  });

  itDb("Repository persistedFindById tenant-scoped: cross-tenant null döner", async () => {
    const inTenantA = await prescriptionsRepository.persistedFindById(
      tenantAId,
      seededPrescriptionAId,
    );
    const inTenantBWithForeignId =
      await prescriptionsRepository.persistedFindById(
        tenantBId,
        seededPrescriptionAId,
      );
    const inTenantAWithBTenantId =
      await prescriptionsRepository.persistedFindById(
        tenantAId,
        seededPrescriptionBId,
      );

    expect(inTenantA?.id).toBe(seededPrescriptionAId);
    expect(inTenantBWithForeignId).toBeNull();
    expect(inTenantAWithBTenantId).toBeNull();
  });

  itDb("Repository search tenant-scoped: doğru tenant kendi kayıtlarını sayar", async () => {
    const aResults = prescriptionsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
    });
    const bResults = prescriptionsRepository.search(tenantBId, {
      limit: 20,
      offset: 0,
    });

    expect(aResults.items.map((r) => r.id)).toEqual([seededPrescriptionAId]);
    expect(aResults.total).toBe(1);
    expect(bResults.items.map((r) => r.id).sort()).toEqual(
      [seededPrescriptionBId, foreignPrescriptionId].sort(),
    );
    expect(bResults.total).toBe(2);
  });

  itDb("Repository search patientId filtresi cross-tenant izolasyonu korur", async () => {
    const aOnBPatient = prescriptionsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      patientId: patientBId,
    });
    const aOnAPatient = prescriptionsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      patientId: patientAId,
    });

    expect(aOnBPatient.items).toEqual([]);
    expect(aOnAPatient.items.map((r) => r.id)).toEqual([seededPrescriptionAId]);
  });

  itDb("Repository search status filtresi yalnızca kendi tenant'ında eşleşir", async () => {
    const aActive = prescriptionsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      status: "active",
    });
    const aDispensed = prescriptionsRepository.search(tenantAId, {
      limit: 20,
      offset: 0,
      status: "dispensed",
    });

    expect(aActive.items.map((r) => r.id)).toEqual([seededPrescriptionAId]);
    expect(aDispensed.items).toEqual([]);
  });

  itDb("Repository insert kendi tenant context'inde yeni kayıt ekler", async () => {
    const newId = `prsc-ins-${randomUUID().slice(0, 8)}`;
    const inserted = await prescriptionsRepository.persist({
      id: newId,
      tenantId: tenantAId,
      examinationId: examAId,
      patientId: patientAId,
      veterinarianId: vetAId,
      items: [
        {
          drugName: "Inserted Drug",
          dosage: "1mg",
          frequency: "once_daily",
          durationDays: 5,
          route: "oral",
        },
      ],
      notes: "Inserted via RLS test",
      status: "active",
      prescribedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      dispensedAt: null,
      dispensedBy: null,
      cancelReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(inserted.tenantId).toBe(tenantAId);
    expect(inserted.id).toBe(newId);
    expect(inserted.notes).toBe("Inserted via RLS test");

    const visible = await withTenant(tenantAId, async (tx) =>
      tx.prescriptionRecord.findUnique({ where: { id: newId } }),
    );
    const invisible = await withTenant(tenantBId, async (tx) =>
      tx.prescriptionRecord.findUnique({ where: { id: newId } }),
    );

    expect(visible?.id).toBe(newId);
    expect(invisible).toBeNull();
  });

  itDb("Repository persistedUpdate doğru tenant'ta başarılı (cancel)", async () => {
    const updated = await prescriptionsRepository.persistedUpdate(
      tenantAId,
      seededPrescriptionAId,
      {
        status: "cancelled",
        cancelReason: "RLS test cancel",
        updatedAt: new Date().toISOString(),
      },
    );
    expect(updated?.id).toBe(seededPrescriptionAId);
    expect(updated?.status).toBe("cancelled");
    expect(updated?.cancelReason).toBe("RLS test cancel");
  });

  itDb("Repository persistedUpdate cross-tenant: null ile sonuçlanır", async () => {
    const result = await prescriptionsRepository.persistedUpdate(
      tenantAId,
      seededPrescriptionBId,
      {
        status: "cancelled",
        cancelReason: "Cross-tenant attack",
        updatedAt: new Date().toISOString(),
      },
    );
    expect(result).toBeNull();

    const untouched = await adminPrisma.prescriptionRecord.findUnique({
      where: { id: seededPrescriptionBId },
    });
    expect(untouched?.status).toBe("active");
    expect(untouched?.cancelReason).toBeNull();
  });

  itDb("App role yalnızca SELECT/INSERT/UPDATE yetkisine sahiptir", async () => {
    const privs = await adminPrisma.$queryRawUnsafe<
      Array<{ privilege_type: string; table_name: string }>
    >(`
      SELECT privilege_type, table_name
      FROM information_schema.role_table_grants
      WHERE grantee = '${appRoleName}'
        AND table_name IN ('prescriptions', 'prescription_items')
      ORDER BY table_name, privilege_type;
    `);
    const presPrivs = privs
      .filter((p) => p.table_name === "prescriptions")
      .map((p) => p.privilege_type);
    const itemPrivs = privs
      .filter((p) => p.table_name === "prescription_items")
      .map((p) => p.privilege_type);
    expect(presPrivs).toEqual(["INSERT", "SELECT", "UPDATE"]);
    expect(itemPrivs).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });
});
