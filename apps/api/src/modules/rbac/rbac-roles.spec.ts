/**
 * @file RBAC rol-bazlı e2e testleri (skip DB gerektirir).
 * @module apps/api/src/modules/rbac/rbac-roles.spec
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";

import { AppModule } from "../../app.module.js";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter.js";
import { RequestIdInterceptor } from "../../common/interceptors/request-id.interceptor.js";

function makeActorHeaders(
  role: "SUPERADMIN" | "OWNER" | "VETERINARIAN" | "STAFF" | "PET_OWNER_PORTAL",
  tenantId = "tnt-test-1",
): Record<string, string> {
  return {
    "x-actor-id": `usr-${role.toLowerCase()}-1`,
    "x-actor-role": role,
    "x-tenant-id": tenantId,
  };
}

const describeE2E =
  process.env["RUN_RBAC_E2E"] === "1" ? describe : describe.skip;

describeE2E("RBAC rol-bazlı API testleri (5 rol)", () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    process.env["APP_VERSION"] = "0.0.0-test";
    process.env["DATABASE_URL"] =
      process.env["DATABASE_URL"] ??
      "postgresql://vetniva:vetniva@localhost:5432/vetniva?schema=public";
    process.env["NODE_ENV"] = "test";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new RequestIdInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("STAFF — okur, yazamaz", () => {
    const tenantId = randomUUID();

    it("POST /tenants/:tenantId/branches → STAFF 403 alır (create yok)", async () => {
      const res = await request(server)
        .post(`/api/v1/tenants/${tenantId}/branches`)
        .send({ code: "X", name: "X" })
        .set(makeActorHeaders("STAFF", tenantId));
      expect(res.status).toBe(403);
    });

    it("GET /tenants → STAFF 403 alır (tenant:tenant:read yok)", async () => {
      const res = await request(server)
        .get("/api/v1/tenants")
        .set(makeActorHeaders("STAFF", tenantId));
      expect(res.status).toBe(403);
    });
  });

  describe("VETERINARIAN — branch create yok", () => {
    const tenantId = randomUUID();

    it("POST /tenants/:tenantId/branches → VETERINARIAN 403 alır", async () => {
      const res = await request(server)
        .post(`/api/v1/tenants/${tenantId}/branches`)
        .send({ code: "Y", name: "Y" })
        .set(makeActorHeaders("VETERINARIAN", tenantId));
      expect(res.status).toBe(403);
    });
  });

  describe("PET_OWNER_PORTAL — tenant endpoint'lerine erişemez", () => {
    const tenantId = randomUUID();

    it("GET /tenants → 403", async () => {
      const res = await request(server)
        .get("/api/v1/tenants")
        .set(makeActorHeaders("PET_OWNER_PORTAL", tenantId));
      expect(res.status).toBe(403);
    });

    it("GET /tenants/:id → 403", async () => {
      const res = await request(server)
        .get(`/api/v1/tenants/${tenantId}`)
        .set(makeActorHeaders("PET_OWNER_PORTAL", tenantId));
      expect(res.status).toBe(403);
    });

    it("POST /tenants → 403", async () => {
      const res = await request(server)
        .post("/api/v1/tenants")
        .send({ slug: "x", name: "X", country: "TR" })
        .set(makeActorHeaders("PET_OWNER_PORTAL", tenantId));
      expect(res.status).toBe(403);
    });
  });
});
