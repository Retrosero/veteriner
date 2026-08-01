/**
 * @file Non-superuser runtime HTTP E2E testi.
 * @module apps/api/test
 * @description Uygulamayı test süreci içinde normal bootstrap ayarlarıyla
 * başlatır. Fixture verisi ayrı migrator bağlantısıyla yazılır; HTTP istekleri
 * `DATABASE_URL` içindeki NOBYPASSRLS runtime rolüyle çalışır.
 * @security Login, AuthGuard actor çözümü ve Controlled Drugs yetki reddi
 * superuser bypass olmadan birlikte doğrulanır.
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { INestApplication } from "@nestjs/common";

interface JsonResponse {
  status: number;
  body: unknown;
}

/** Derlenmiş CommonJS bootstrap'ın test için gereken tek dışa aktarımı. */
interface CompiledMainModule {
  createApiApplication: () => Promise<INestApplication>;
}

const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];
if (!migratorDatabaseUrl) {
  throw new Error(
    "DATABASE_MIGRATOR_URL zorunludur; HTTP E2E fixture verisi runtime rolüyle yazılamaz.",
  );
}

const migratorPrisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl } },
});
const suffix = randomUUID();
const tenantId = randomUUID();
const branchId = randomUUID();
const userId = randomUUID();
const email = `runtime-role-${suffix}@vetniva.test`;
const password = "VetNiva-Runtime-Role-Password-2026";
const httpPort = 32000 + (Number.parseInt(suffix.slice(0, 4), 16) % 1000);

let app: INestApplication;
let baseUrl = "";

function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("HTTP yanıtı JSON nesnesi olmalıdır.");
  }
  return body as Record<string, unknown>;
}

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<JsonResponse> {
  const response = await fetch(new URL(path, baseUrl), init);
  const text = await response.text();
  return {
    status: response.status,
    body: text.length === 0 ? null : (JSON.parse(text) as unknown),
  };
}

describe("Non-superuser runtime HTTP", () => {
  beforeAll(async () => {
    await migratorPrisma.tenant.create({
      data: {
        id: tenantId,
        slug: `runtime-role-${suffix}`,
        name: "Runtime Role E2E Tenant",
        country: "TR",
      },
    });
    await migratorPrisma.branch.create({
      data: {
        id: branchId,
        tenantId,
        code: `runtime-${suffix.slice(0, 8)}`,
        name: "Runtime Role E2E Branch",
      },
    });
    await migratorPrisma.user.create({
      data: {
        id: userId,
        email,
        passwordHash: await hash(password, 12),
        displayName: "Runtime Role Staff",
      },
    });
    await migratorPrisma.userTenantMembership.create({
      data: { userId, tenantId, role: "STAFF" },
    });

    // HTTP E2E, Nest decorator metadata'sını Vitest transformuna değil CI'nin
    // çalıştırdığı derlenmiş CommonJS çıktısına dayandırır.
    const compiledMainUrl = pathToFileURL(
      resolve(process.cwd(), "dist", "main.js"),
    ).href;
    const compiledMain = (await import(
      compiledMainUrl
    )) as unknown as CompiledMainModule;
    app = await compiledMain.createApiApplication();
    await app.listen(httpPort, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${httpPort}`;
  });

  afterAll(async () => {
    await app?.close();
    await migratorPrisma.userSession.deleteMany({ where: { userId } });
    await migratorPrisma.userTenantMembership.deleteMany({ where: { userId } });
    await migratorPrisma.user.deleteMany({ where: { id: userId } });
    await migratorPrisma.branch.deleteMany({ where: { id: branchId } });
    await migratorPrisma.tenant.deleteMany({ where: { id: tenantId } });
    await migratorPrisma.$disconnect();
  });

  it("health ve login runtime rolüyle çalışır; session tenant çözümü korunur", async () => {
    const health = await requestJson("/api/v1/health");
    expect(health.status).toBe(200);

    const login = await requestJson("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = objectBody(login.body);
    const token = loginBody["sessionToken"];

    expect(login.status).toBe(200);
    expect(typeof token).toBe("string");
    expect(loginBody["branchId"]).toBe(branchId);
    const auditEvent = await migratorPrisma.auditEvent.findFirst({
      where: {
        eventName: "audit:auth.login.success",
        tenantId,
        actorId: userId,
      },
      select: { id: true },
    });
    expect(typeof auditEvent?.id).toBe("string");

    const switchTenant = await requestJson("/auth/switch-tenant", {
      method: "POST",
      headers: {
        authorization: `Bearer ${String(token)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tenantSlug: `runtime-role-${suffix}` }),
    });
    expect(switchTenant.status).toBe(200);
    expect(objectBody(switchTenant.body)["tenantId"]).toBe(tenantId);
  });

  it("STAFF actor sahte header ile Controlled Drugs yazma yetkisi kazanamaz", async () => {
    const login = await requestJson("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const token = objectBody(login.body)["sessionToken"];

    const receipt = await requestJson("/api/v1/cd/receipts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${String(token)}`,
        "content-type": "application/json",
        "x-actor-role": "SUPERADMIN",
      },
      body: JSON.stringify({}),
    });

    expect(login.status).toBe(200);
    expect(receipt.status).toBe(403);
  });
});
