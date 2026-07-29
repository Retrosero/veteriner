/**
 * @file API e2e smoke testi.
 * @module apps/api/test
 *
 * @description API'yi başlatır ve health endpoint'lerinin temel
 * davranışını doğrular. CI'da `pnpm e2e:smoke` ile çalışır.
 *
 * @security Testler herhangi bir secret içermez; DATABASE_URL ortam
 * değişkeninden alınır. DB yoksa readiness `down` döner, test buna
 * toleranslıdır.
 */

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";
import { RequestIdInterceptor } from "../src/common/interceptors/request-id.interceptor.js";

describe("API smoke (e2e)", () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication["getHttpServer"]>;

  beforeAll(async () => {
    process.env["APP_VERSION"] = "0.0.0-test";
    process.env["DATABASE_URL"] =
      process.env["DATABASE_URL"] ??
      "postgresql://vetniva:vetniva@localhost:5432/vetniva?schema=public";

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

  it("GET /api/v1/health → 200, status: ok", async () => {
    const res = await request(server).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("GET /api/v1/health/ready → 200 veya 503, body ReadynessResponse şemasına uyuyor", async () => {
    const res = await request(server).get("/api/v1/health/ready");
    expect([200, 503]).toContain(res.status);
    expect(["ok", "degraded", "down"]).toContain(res.body.status);
    expect(res.body.components).toBeDefined();
    expect(res.body.components.db).toBeDefined();
  });

  it("GET /api/v1/bil-invali-route → 404", async () => {
    const res = await request(server).get("/api/v1/this-route-does-not-exist");
    expect(res.status).toBe(404);
  });
});
