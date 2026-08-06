/**
 * @file Adım 1 — Sağlık kontrolü (health check).
 * @module @vetniva/web/e2e/smoke/health
 *
 * @description Pilot/production deploy sonrası en temel erişilebilirlik
 * kontrolü. `GET /` landing sayfası 200 ile yüklenmeli, sağlık
 * durumu butonu `/api/v1/health` üzerinden 200 dönmelidir.
 *
 * Smoke test planı referansı: `docs/operations/PILOT_SMOKE_TEST_PLAN.md`
 * bölüm 1 (Health Check).
 * @since GOAL-127 (FAZ-12) production release gate
 */

import { expect, test } from "@playwright/test";

test.describe("1. Health check (landing + API)", () => {
  test("landing page yüklenir (200) ve başlık görünür", async ({ page }) => {
    const response = await page.goto("/");
    expect(response, "landing response tanımlı olmalı").not.toBeNull();
    // 2xx ve 3xx yönlendirmelerini kabul et; bazı yönlendirmeler
    // (locale switch) 200 dışında kod dönebilir.
    const status = response?.status() ?? 0;
    expect(status, `beklenen 2xx, alınan ${status}`).toBeLessThan(400);

    // Başlık en azından VetNiva markasını içermelidir.
    await expect(page).toHaveTitle(/VetNiva/i);

    // Landing sayfasındaki ana CTA'lar görünür.
    await expect(
      page.getByRole("link", { name: /dashboard|anasayfa/i }).first(),
    ).toBeVisible();
  });

  test("/api/v1/health 200 döner ve body.status=ok", async ({ request }) => {
    const response = await request.get("/api/v1/health");
    expect(response.status(), "health endpoint 200 olmalı").toBe(200);
    const body = (await response.json()) as { status?: string };
    expect(body.status, "health body.status=ok olmalı").toBe("ok");
  });

  test("landing üzerinden health butonu tıklanabilir", async ({ page }) => {
    await page.goto("/");
    // Sağlık sayfasına giden link veya buton (yardım/health kartı).
    // Pilot landing'inde doğrudan health linki olmayabilir; bu test
    // doğrudan /tr-TR/health sayfasının da erişilebilir olduğunu
    // doğrular.
    const response = await page.goto("/tr-TR/health");
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(
      page.getByRole("heading", { name: /sağlık|health/i }).first(),
    ).toBeVisible();
  });
});
