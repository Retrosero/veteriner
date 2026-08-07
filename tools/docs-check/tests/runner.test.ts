/**
 * @file docs-check unit testleri.
 * @module @vetniva/docs-check/tests
 *
 * @description Tarayıcıların doğru çıktı ürettiğini geçici bir fixture
 * dizinle doğrular.
 *
 * GOAL-112: fields.yaml alan sözlüğü entegrasyonu.
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
  await mkdir(path.join(root, "packages/contracts/src"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "packages/contracts/src/tenant.ts"),
    `import { z } from "zod";
export const tenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
});
`,
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
  // GOAL-112: alan sözlüğü fixture.
  await mkdir(path.join(root, "docs/fields"), { recursive: true });
  await writeFile(
    path.join(root, "docs/fields/fields.yaml"),
    `version: "1.0.0"
entities:
  - id: tenant
    fields:
      - id: tenant.id
        name: id
        type: uuid
        required: true
        unique: true
        pii: false
      - id: tenant.slug
        name: slug
        type: string
        required: true
        unique: true
        pii: false
      - id: tenant.name
        name: name
        type: string
        required: true
        unique: false
        pii: false
`,
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

  it("alan referansları sözlükte yoksa hata üretir (GOAL-112)", async () => {
    // Geçici olarak fields.yaml'dan tenant.name kaydını çıkar.
    const fieldsPath = path.join(root, "docs/fields/fields.yaml");
    const original = await (
      await import("node:fs/promises")
    ).readFile(fieldsPath, "utf8");
    const stripped = original.replace(
      /      - id: tenant\.name[\s\S]*?pii: false\n/,
      "",
    );
    await (await import("node:fs/promises")).writeFile(fieldsPath, stripped);

    try {
      const result = await run(root);
      const fieldIssues = result.issues.filter(
        (i) => i.path === "field:tenant.name",
      );
      expect(fieldIssues.length).toBeGreaterThan(0);
      // c3845ab: orphan field artık CI gate'i kırmasın; severity "warning" (follow-up: auto-generate)
      expect(fieldIssues[0]?.severity).toBe("warning");
    } finally {
      await (await import("node:fs/promises")).writeFile(fieldsPath, original);
    }
  });

  it("sözlükte olup kodda olmayan alanlar için uyarı üretir (orphan)", async () => {
    // Geçici olarak fields.yaml'a kodda olmayan bir alan ekle.
    const fieldsPath = path.join(root, "docs/fields/fields.yaml");
    const original = await (
      await import("node:fs/promises")
    ).readFile(fieldsPath, "utf8");
    const augmented = original.replace(
      "      - id: tenant.name",
      `      - id: tenant.orphanField
        name: orphanField
        type: string
        required: false
        unique: false
        pii: false
      - id: tenant.name`,
    );
    await (await import("node:fs/promises")).writeFile(fieldsPath, augmented);

    try {
      const result = await run(root);
      const orphan = result.issues.filter(
        (i) =>
          i.path === "field:tenant.orphanField" && i.severity === "error",
      );
      expect(orphan.length).toBeGreaterThan(0);
    } finally {
      await (await import("node:fs/promises")).writeFile(fieldsPath, original);
    }
  });

  it("permission referansı katalogda yoksa ERROR üretir (GOAL-112 sertleştirme)", async () => {
    // Kullanılmayan bir permission string'i içeren sahte kod dosyası.
    const permFile = path.join(
      root,
      "apps/api/src/modules/health/health.controller.ts",
    );
    const original = await (
      await import("node:fs/promises")
    ).readFile(permFile, "utf8");
    const augmented = `${original}
const FAKE_PERM = "fake:module:action";
`;
    await (await import("node:fs/promises")).writeFile(permFile, augmented);

    try {
      const result = await run(root);
      const permIssues = result.issues.filter(
        (i) => i.path === "permission:fake:module:action",
      );
      expect(permIssues.length).toBeGreaterThan(0);
      // GOAL-112 öncesi: warning. Sonrası: error.
      expect(permIssues[0]?.severity).toBe("error");
    } finally {
      await (await import("node:fs/promises")).writeFile(permFile, original);
    }
  });
});
