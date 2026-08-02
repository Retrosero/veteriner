/**
 * @file Error events PostgreSQL RLS entegrasyon testi.
 * @module apps/api/test
 * @description Kısıtlı runtime rolünün hata aggregate'lerini yalnız doğru
 * tenant bağlamında yazıp okuyabildiğini doğrular. Aynı fingerprint farklı
 * tenant'larda bağımsız aggregate olarak kalmalıdır.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ErrorEventsRepository } from "../src/modules/error-events/error-events.repository.js";

import type { ErrorEventRecord } from "../src/common/error-events/error-event.types.js";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { Prisma } from "@prisma/client";

const migratorUrl = process.env["DATABASE_MIGRATOR_URL"];
const runtimeUrl = process.env["DATABASE_URL"];
if (!migratorUrl || !runtimeUrl) throw new Error("DATABASE_URL ve DATABASE_MIGRATOR_URL zorunludur.");

const admin = new PrismaClient({ datasources: { db: { url: migratorUrl } } });
const appRole = "vetniva_error_events_e2e_app";
const appUrl = new URL(runtimeUrl);
appUrl.username = appRole;
appUrl.password = "vetniva-error-events-e2e-password";
const app = new PrismaClient({ datasources: { db: { url: appUrl.toString() } } });
const repository = new ErrorEventsRepository(app as unknown as PrismaService);
const tenantA = randomUUID();
const tenantB = randomUUID();
const fingerprint = "0123456789abcdef";
type Tx = Prisma.TransactionClient;

async function dropTestRole(): Promise<void> {
  await admin.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        DROP OWNED BY vetniva_error_events_e2e_app;
        DROP ROLE vetniva_error_events_e2e_app;
      END IF;
    END $$;
  `);
}

async function asTenant<T>(tenantId: string, action: (tx: Tx) => Promise<T>): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
    return action(tx);
  });
}

function record(tenantId: string): ErrorEventRecord {
  const now = new Date().toISOString();
  return { id: randomUUID(), requestId: randomUUID(), tenantId, branchId: null, userId: null,
    actorType: "system", module: "unknown", route: "/e2e/error-events", release: "e2e",
    severity: "error", fingerprint, errorCode: "VET-SYSTEM-0001", message: "RLS proof",
    statusCode: 500, stack: null, context: {}, country: "TR", occurredAt: now,
    firstSeenAt: now, lastSeenAt: now, occurrenceCount: 1, status: "new", assignedToUserId: null };
}

describe("Error events PostgreSQL RLS", () => {
  beforeAll(async () => {
    await dropTestRole();
    await admin.$executeRawUnsafe(`CREATE ROLE ${appRole} LOGIN PASSWORD 'vetniva-error-events-e2e-password' NOSUPERUSER NOBYPASSRLS`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await admin.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE ON error_events TO ${appRole}`);
    await admin.tenant.createMany({ data: [
      { id: tenantA, slug: `err-rls-a-${tenantA}`, name: "Error RLS A", country: "TR" },
      { id: tenantB, slug: `err-rls-b-${tenantB}`, name: "Error RLS B", country: "TR" },
    ] });
  });

  afterAll(async () => {
    await admin.errorEvent.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await admin.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await dropTestRole();
    await app.$disconnect();
    await admin.$disconnect();
  });

  it("aynı fingerprint'i tenant bazında ayırır ve çapraz okumayı reddeder", async () => {
    await repository.persistSnapshot(record(tenantA));
    await repository.persistSnapshot(record(tenantB));

    await expect(asTenant(tenantA, (tx) => tx.errorEvent.count())).resolves.toBe(1);
    await expect(asTenant(tenantB, (tx) => tx.errorEvent.count())).resolves.toBe(1);
    await expect(app.errorEvent.count()).resolves.toBe(0);
    await expect(admin.errorEvent.count({ where: { fingerprint } })).resolves.toBe(2);
  });
});
