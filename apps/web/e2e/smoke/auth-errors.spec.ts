/**
 * @file Adım 9 — Hata yönetimi (401 / 403 / 404).
 * @module @vetniva/web/e2e/smoke/auth-errors
 *
 * @description Production gate'in hata yolu testleri:
 * - 401: Oturumsuz dashboard erişimi login'e yönlendirmeli.
 * - 403: Yetkisiz rolün korunan kaynağa erişimi reddedilmeli.
 * - 404: Var olmayan hasta/sayfa 404 sayfası göstermeli.
 *
 * Smoke test planı referansı: `docs/operations/PILOT_SMOKE_TEST_PLAN.md`
 * bölüm 8 (Hata Yönetimi).
 * @since GOAL-127 (FAZ-12) production release gate
 */

import { expect, test } from "@playwright/test";

import { DEMO_USERS, loginAs, waitForPath } from "./helpers";

test.describe("9. Hata yönetimi (401 / 403 / 404)", () => {
  test("401 — oturumsuz dashboard login'e yönlendirir", async ({ page }) => {
    // Yeni context (cookie yok) → public sayfa olmayan dashboard'a
    // direkt erişim login'e yönlendirmeli.
    await page.context().clearCookies();
    await page.goto("/tr-TR/dashboard");
    // Yönlendirme tamamlanana kadar bekle.
    await waitForPath(page, /\/tr-TR\/login/);
    // Login formu görünür.
    await expect(
      page.getByRole("button", { name: /giriş|sign in/i }),
    ).toBeVisible();
  });

  test("403 — STAFF rolü SUPERADMIN sayfasına erişemez", async ({ page }) => {
    const staff = DEMO_USERS.find((u) => u.label === "staff");
    if (!staff) throw new Error("Staff demo user tanımsız");
    await loginAs(page, staff);

    // SUPERADMIN sayfası: erişim deneyin.
    const response = await page.goto("/tr-TR/superadmin");

    // 403 forbidden ya da login sayfasına yönlendirme olabilir.
    // Her iki durum da kabul edilebilir; yetkisiz erişim engellenmiş
    // sayılır.
    const status = response?.status() ?? 0;
    const url = page.url();
    const denied =
      status === 403 ||
      status === 401 ||
      url.includes("/login") ||
      /403|forbidden|yetkiniz|yetki/i.test(await page.content());
    expect(denied, "STAFF SUPERADMIN sayfasına erişememeli").toBe(true);
  });

  test("404 — var olmayan hasta 404 sayfası gösterir", async ({ page }) => {
    const vet = DEMO_USERS.find((u) => u.label === "vet");
    if (!vet) throw new Error("Vet demo user tanımsız");
    await loginAs(page, vet);

    const bogusId = "00000000-0000-0000-0000-000000000000";
    const response = await page.goto(`/tr-TR/patients/${bogusId}`);
    const status = response?.status() ?? 0;

    // Backend 404 dönmeli ya da UI "bulunamadı" mesajı göstermeli.
    const notFoundText = await page
      .getByText(/bulunamadı|not found|404|yok/i)
      .first()
      .innerText()
      .catch(() => "");
    const ok = status === 404 || notFoundText.length > 0;
    expect(ok, `var olmayan hasta için 404 bekleniyor (status=${status})`).toBe(
      true,
    );
  });

  test("401 — /api/v1/users/me oturumsuz 401 döner", async ({ request }) => {
    // API guard'ı auth header olmadan 401 dönmeli.
    const response = await request.get("/api/v1/users/me");
    expect(
      response.status(),
      `oturumsuz API 401 dönmeli, alınan ${response.status()}`,
    ).toBe(401);
  });
});
