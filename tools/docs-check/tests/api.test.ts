/**
 * @file API route scanner testleri.
 * @module @vetniva/docs-check/tests/api
 *
 * @description `scanApiRoutes` fonksiyonunun NestJS controller
 * dosyalarından route çıkarımı, docKey üretimi ve method
 * normalizasyonunu doğrular. Statik analiz tabanlı olduğundan
 * sınır durumları (sub-path birleştirme, kolon temizleme) özellikle
 * test edilir.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanApiRoutes } from "../src/scanners/api.js";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "api-scanner-"));

  // apps/api/src/modules/health — düz controller.
  await mkdir(path.join(root, "apps/api/src/modules/health"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/api/src/modules/health/health.controller.ts"),
    `import { Controller, Get, Post, Delete } from '@nestjs/common';
@Controller('api/v1/health')
export class HealthController {
  @Get('/') liveness() { return 'ok'; }
  @Get('ready') readiness() { return 'ok'; }
  @Post('check') check() { return 'ok'; }
  @Delete('cache') clear() { return 'ok'; }
}`,
  );

  // apps/api/src/modules/owners — farklı prefix + dinamik segment.
  await mkdir(path.join(root, "apps/api/src/modules/owners"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/api/src/modules/owners/owners.controller.ts"),
    `import { Controller, Get, Patch } from '@nestjs/common';
@Controller('api/v1/owners')
export class OwnersController {
  @Get('/') list() { return []; }
  @Get(':id') get() { return {}; }
  @Patch(':id') update() { return {}; }
}`,
  );

  // apps/api/src/modules/orders — path dekoratörsüz controller.
  await mkdir(path.join(root, "apps/api/src/modules/orders"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/api/src/modules/orders/orders.controller.ts"),
    `import { Controller, Get, Put } from '@nestjs/common';
@Controller()
export class OrdersController {
  @Get('list') list() { return []; }
  @Put('replace') replace() { return {}; }
}`,
  );
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanApiRoutes", () => {
  it("controller prefix + sub-path birleşimini doğru üretir", async () => {
    const routes = await scanApiRoutes(path.join(root, "apps/api"));
    // sub-path '/' joinPaths sonrası '/api/v1/health' üretir (sonundaki
    // '/' korunur — bu scanner'ın mevcut davranışıdır).
    const live = routes.find((r) => r.path === "Get /api/v1/health");
    expect(live).toBeDefined();
    expect(live?.method).toBe("Get");
    expect(live?.docKey).toBe("api.get._api_v1_health");
  });

  it("sub-path'ler için docKey tireli format üretir", async () => {
    const routes = await scanApiRoutes(path.join(root, "apps/api"));
    const ready = routes.find((r) => r.path === "Get /api/v1/health/ready");
    expect(ready?.docKey).toBe("api.get._api_v1_health_ready");
    const check = routes.find((r) => r.path === "Post /api/v1/health/check");
    expect(check?.docKey).toBe("api.post._api_v1_health_check");
    expect(check?.method).toBe("Post");
  });

  it("dinamik parametreleri (:id) docKey'e çevirir", async () => {
    const routes = await scanApiRoutes(path.join(root, "apps/api"));
    const getById = routes.find((r) => r.path === "Get /api/v1/owners/:id");
    expect(getById?.docKey).toBe("api.get._api_v1_owners__id");
    const patchById = routes.find((r) => r.path === "Patch /api/v1/owners/:id");
    expect(patchById?.method).toBe("Patch");
  });

  it("prefix'i olmayan controller için kök path döner", async () => {
    const routes = await scanApiRoutes(path.join(root, "apps/api"));
    const list = routes.find((r) => r.path === "Get /list");
    expect(list).toBeDefined();
    expect(list?.docKey).toBe("api.get._list");
  });

  it("tüm HTTP methodlarını (Get/Post/Put/Patch/Delete) destekler", async () => {
    const routes = await scanApiRoutes(path.join(root, "apps/api"));
    const methods = new Set(routes.map((r) => r.method as string | undefined));
    expect(methods.has("Get")).toBe(true);
    expect(methods.has("Post")).toBe(true);
    expect(methods.has("Put")).toBe(true);
    expect(methods.has("Patch")).toBe(true);
    expect(methods.has("Delete")).toBe(true);
  });

  it("controller dosyası olmayan dizin için boş liste döner", async () => {
    const empty = await scanApiRoutes(
      path.join(root, "apps/api/src/modules/__nonexistent__"),
    );
    expect(empty).toEqual([]);
  });

  it("apps/api dizini mevcut değilse boş liste döner", async () => {
    const missing = await scanApiRoutes(
      path.join(root, "__missing_apps_api__"),
    );
    expect(missing).toEqual([]);
  });

  it("docKey'ler docs/api/<key>.md dosya adıyla eşleşir", async () => {
    // Runner mantığı: docs/api/<docKey>.md dosyası aranır.
    // Burada docKey formatının dosya adı olarak güvenli olduğunu garanti ederiz.
    const routes = await scanApiRoutes(path.join(root, "apps/api"));
    for (const r of routes) {
      expect(r.docKey).toMatch(/^api\.(get|post|put|patch|delete)\./);
      expect(r.docKey).not.toContain("/");
      expect(r.docKey).not.toContain("\\");
    }
  });
});
