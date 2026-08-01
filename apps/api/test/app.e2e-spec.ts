/**
 * @file API HTTP smoke E2E testi.
 * @module apps/api/test
 * @description Derlenmiş ve çalışan API'ye HTTP üzerinden bağlanır. Böylece
 * Nest decorator/DI dönüşümü production çalışma biçimiyle aynı kalır. CI
 * servisi başlatır; test public health/auth sınırını ve gerçek oturumdan
 * türetilen RBAC kararını doğrular. Güvenlik: Controlled Drugs yazma
 * endpoint'i oturumsuz veya sahte header ile yetki yükseltmeye çalışan
 * isteği iş kuralına ulaşmadan reddetmelidir.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface E2eResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

interface ManagedApiApplication {
  close(): Promise<void>;
  getHttpServer(): { address(): unknown };
  listen(port: number, host: string): Promise<void>;
}

interface CompiledApiModule {
  createApiApplication(): Promise<ManagedApiApplication>;
}

let baseUrl = process.env["E2E_BASE_URL"];
let managedApplication: ManagedApiApplication | undefined;
const migratorDatabaseUrl = process.env["DATABASE_MIGRATOR_URL"];

if (!migratorDatabaseUrl) {
  throw new Error(
    "DATABASE_MIGRATOR_URL zorunludur; E2E fixture verisi runtime uygulama rolüyle yazılamaz.",
  );
}

const prisma = new PrismaClient({
  datasources: { db: { url: migratorDatabaseUrl } },
});
const e2eSuffix = randomUUID();
const tenantId = randomUUID();
const branchId = randomUUID();
const userId = randomUUID();
const testEmail = `rbac-e2e-${e2eSuffix}@vetniva.test`;
const testPassword = "VetNiva-E2E-Password-2026";

/**
 * E2E API'sine istek atar ve JSON gövdesini güvenli `unknown` sınırında döner.
 * @param {string} path API köküne göre istek yolu.
 * @param {object} init İsteğe bağlı HTTP yapılandırması.
 * @returns {Promise<E2eResponse>} HTTP durum, header ve JSON gövdesi.
 */
async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<E2eResponse> {
  const response = await fetch(new URL(path, baseUrl), init);
  const content = await response.text();
  let body: unknown = null;
  if (content.length > 0) {
    try {
      body = JSON.parse(content) as unknown;
    } catch {
      body = content;
    }
  }
  return { status: response.status, headers: response.headers, body };
}

/**
 * JSON gövdesinin alan erişimi için nesne olmasını zorunlu kılar.
 * @param {unknown} body Doğrulanacak response gövdesi.
 * @returns {Record<string, unknown>} Anahtar-değer response gövdesi.
 */
function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("E2E response body bir JSON nesnesi olmalıdır.");
  }
  return body as Record<string, unknown>;
}

/** Gerçek login yanıtından bearer session token'ını çıkarır. */
function sessionToken(body: unknown): string {
  const token = objectBody(body)["sessionToken"];
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Login yanıtında sessionToken bulunamadı.");
  }
  return token;
}

describe("API smoke (e2e)", () => {
  beforeAll(async () => {
    if (!baseUrl) {
      const compiledModule =
        (await import("../dist/main.js")) as CompiledApiModule;
      managedApplication = await compiledModule.createApiApplication();
      await managedApplication.listen(0, "127.0.0.1");

      const address = managedApplication.getHttpServer().address();
      if (
        !address ||
        typeof address !== "object" ||
        !("port" in address) ||
        typeof address.port !== "number"
      ) {
        throw new Error("Yönetilen E2E API portu çözümlenemedi.");
      }

      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `rbac-e2e-${e2eSuffix}`,
        name: "RBAC E2E Tenant",
        country: "TR",
      },
    });
    await prisma.branch.create({
      data: {
        id: branchId,
        tenantId,
        code: "rbac-e2e",
        name: "RBAC E2E Branch",
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: testEmail,
        passwordHash: await hash(testPassword, 12),
        displayName: "RBAC E2E Staff",
      },
    });
    await prisma.userTenantMembership.create({
      data: { userId, tenantId, role: "STAFF" },
    });
  });

  afterAll(async () => {
    await prisma.userSession.deleteMany({ where: { userId } });
    await prisma.userTenantMembership.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
    await managedApplication?.close();
  });

  it("GET /api/v1/health → 200, status: ok", async () => {
    const response = await requestJson("/api/v1/health");
    const body = objectBody(response.body);

    expect(response.status).toBe(200);
    expect(body["status"]).toBe("ok");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("GET /api/v1/health/ready → 200 veya 503", async () => {
    const response = await requestJson("/api/v1/health/ready");
    const body = objectBody(response.body);
    const components = objectBody(body["components"]);

    expect([200, 503]).toContain(response.status);
    expect(["ok", "degraded", "down"]).toContain(body["status"]);
    expect(components["db"]).toBeDefined();
  });

  it("bilinmeyen route → 404", async () => {
    const response = await requestJson("/api/v1/this-route-does-not-exist");

    expect(response.status).toBe(404);
  });

  it("Controlled Drugs receipt oturumsuz isteği 401 ile reddeder", async () => {
    const response = await requestJson("/api/v1/cd/receipts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = objectBody(response.body);

    expect(response.status).toBe(401);
    expect(body["error_code"]).toBe("VET-AUTH-0001");
  });

  it("public forgot-password route geçersiz gövdeyi 422 ile reddeder", async () => {
    const response = await requestJson("/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = objectBody(response.body);

    expect(response.status).toBe(422);
    expect(body["error_code"]).toBe("VET-VALIDATION-0001");
  });

  it("sahte actor header'ı STAFF session yetkisini yükseltmez", async () => {
    const login = await requestJson("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const token = sessionToken(login.body);

    expect(login.status).toBe(200);

    const branchCreate = await requestJson(
      `/api/v1/tenants/${tenantId}/branches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "x-actor-role": "SUPERADMIN",
          "x-tenant-id": randomUUID(),
        },
        body: JSON.stringify({ code: "forged-admin", name: "Forged admin" }),
      },
    );

    expect(branchCreate.status).toBe(403);
  });

  it("STAFF session Controlled Drugs yazma yetkisi kazanmaz", async () => {
    const login = await requestJson("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const token = sessionToken(login.body);

    const receipt = await requestJson("/api/v1/cd/receipts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-actor-role": "SUPERADMIN",
      },
      body: JSON.stringify({}),
    });

    expect(login.status).toBe(200);
    expect(receipt.status).toBe(403);
  });
});
