/**
 * @file docs-check unit testleri.
 * @module @vetniva/docs-check/tests
 *
 * @description Tarayıcıların doğru çıktı ürettiğini geçici bir fixture
 * dizinle doğrular.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { run } from "../src/runner.js";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "docs-check-"));
  await mkdir(path.join(root, "apps/web/app/[locale]/health"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/web/app/[locale]/health/page.tsx"),
    "export default function Page() { return null }",
  );
  await mkdir(path.join(root, "apps/api/src/modules/health"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/api/src/modules/health/health.controller.ts"),
    `import { Controller, Get } from '@nestjs/common';
@Controller('api/v1/health')
export class HealthController {
  @Get() liveness() { return 'ok'; }
  @Get('ready') readiness() { return 'ok'; }
}`,
  );
  await mkdir(path.join(root, "docs/pages"), { recursive: true });
  await writeFile(
    path.join(root, "docs/pages/web.app.locale.health.yaml"),
    'page_id: web.app.locale.health\nroute: "/:locale/health"\n',
  );
  await mkdir(path.join(root, "docs/api"), { recursive: true });
  await writeFile(
    path.join(root, "docs/api/api.get._api_v1_health.md"),
    "# Liveness\n",
  );
  await writeFile(
    path.join(root, "docs/api/api.get._api_v1_health_ready.md"),
    "# Readiness\n",
  );
  await mkdir(path.join(root, "docs/errors"), { recursive: true });
  await writeFile(
    path.join(root, "docs/errors/ERROR_CATALOG.md"),
    "- `TR_COMMON_0001` — Genel hata",
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("docs-check", () => {
  it("tüm kayıtlar mevcutsa hata vermez", async () => {
    const result = await run(root);
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});
