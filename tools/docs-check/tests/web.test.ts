/**
 * @file Web (Next.js) route scanner testleri.
 * @module @vetniva/docs-check/tests/web
 *
 * @description `scanWebRoutes` fonksiyonunun `app/[locale]/page.tsx`
 * dosyalarını bulma, `[locale]` placeholder dönüşümü ve docKey
 * üretimini doğrular.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanWebRoutes } from "../src/scanners/web.js";

let root: string;

const SIMPLE_PAGE = "export default function Page() { return null }";

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "web-scanner-"));

  // Kök sayfa.
  await mkdir(path.join(root, "apps/web/app"), { recursive: true });
  await writeFile(path.join(root, "apps/web/app/page.tsx"), SIMPLE_PAGE);

  // /[locale] altında dashboard.
  await mkdir(path.join(root, "apps/web/app/[locale]/dashboard"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/web/app/[locale]/dashboard/page.tsx"),
    SIMPLE_PAGE,
  );

  // /[locale]/owners/[ownerId] — iç içe dinamik segment.
  await mkdir(path.join(root, "apps/web/app/[locale]/owners/[ownerId]"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/web/app/[locale]/owners/[ownerId]/page.tsx"),
    SIMPLE_PAGE,
  );

  // page.ts (uzantısız) — eski stil.
  await mkdir(path.join(root, "apps/web/app/[locale]/legacy"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "apps/web/app/[locale]/legacy/page.ts"),
    SIMPLE_PAGE,
  );
});

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanWebRoutes", () => {
  it("app/page.tsx için /app path'i ve web.app docKey üretir", async () => {
    const routes = await scanWebRoutes(path.join(root, "apps/web"));
    const rootRoute = routes.find((r) => r.path === "/app");
    expect(rootRoute).toBeDefined();
    expect(rootRoute?.docKey).toBe("pages/web.app");
  });

  it("[locale] segmentini :locale placeholder'ına çevirir", async () => {
    const routes = await scanWebRoutes(path.join(root, "apps/web"));
    const dash = routes.find((r) => r.path === "/app/:locale/dashboard");
    expect(dash).toBeDefined();
    expect(dash?.docKey).toBe("pages/web.app.locale.dashboard");
  });

  it("iç içe dinamik segmentleri destekler", async () => {
    const routes = await scanWebRoutes(path.join(root, "apps/web"));
    const nested = routes.find(
      (r) => r.path === "/app/:locale/owners/[ownerId]",
    );
    expect(nested).toBeDefined();
    // docKey: [locale] → "locale"; [ownerId] korunur (yalnızca [locale]
    // otomatik dönüştürülür; diğer dinamik segmentler olduğu gibi
    // bırakılır — path bilgisi burada amaçlanan şekilde kalır).
    expect(nested?.docKey).toBe("pages/web.app.locale.owners.[ownerId]");
  });

  it(".ts uzantılı sayfaları da kabul eder", async () => {
    const routes = await scanWebRoutes(path.join(root, "apps/web"));
    const legacy = routes.find((r) => r.path === "/app/:locale/legacy");
    expect(legacy).toBeDefined();
    expect(legacy?.docKey).toBe("pages/web.app.locale.legacy");
  });

  it("docKey formatı nokta ile ayrılmış ve dosya adı olarak güvenli", async () => {
    // Runner mantığı: docs/pages/<docKey>.yaml dosyası aranır.
    // Burada docKey formatının dosya adı olarak güvenli olduğunu garanti ederiz.
    const routes = await scanWebRoutes(path.join(root, "apps/web"));
    for (const r of routes) {
      expect(r.docKey).toMatch(/^pages\/web\./);
      expect(r.docKey).not.toContain("/page");
      expect(r.docKey.endsWith(".tsx") || r.docKey.endsWith(".ts")).toBe(false);
    }
  });

  it("mevcut olmayan apps/web dizini için boş liste döner", async () => {
    const missing = await scanWebRoutes(
      path.join(root, "__missing_apps_web__"),
    );
    expect(missing).toEqual([]);
  });

  it("hiç page.tsx olmayan dizin için boş liste döner", async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), "web-scanner-empty-"));
    await mkdir(path.join(emptyDir, "apps/web/app"), { recursive: true });
    const routes = await scanWebRoutes(path.join(emptyDir, "apps/web"));
    expect(routes).toEqual([]);
    await rm(emptyDir, { recursive: true, force: true });
  });
});
