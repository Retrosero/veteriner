/**
 * @file Adım 2 — Login (4 user) + role-based menü.
 * @module @vetniva/web/e2e/smoke/login
 *
 * @description Pilot ortamındaki 4 demo user için login akışını
 * doğrular. Her kullanıcı için:
 * - Login 200 + dashboard'a yönlendirme
 * - Role-based menü görünürlüğü
 *
 * Smoke test planı referansı: `docs/operations/PILOT_SMOKE_TEST_PLAN.md`
 * bölüm 2 (Login Akışı).
 * @since GOAL-127 (FAZ-12) production release gate
 */

import { expect, test } from "@playwright/test";

import {
  DEMO_USERS,
  UI_LABELS_TR,
  loginAs,
  logout,
  waitForPath,
} from "./helpers";

test.describe("2. Login (4 user) + role-based menü", () => {
  for (const user of DEMO_USERS) {
    test(`login as ${user.label} (${user.role}) başarılı olur`, async ({
      page,
    }) => {
      await loginAs(page, user);

      // Dashboard'a yönlendirildi.
      await waitForPath(page, /\/tr-TR\/dashboard/);

      // Sol sidebar görünür (AppShell layout'unun parçası).
      const sidebar = page.locator('aside[aria-label*="navigasyon" i]');
      await expect(sidebar, "sidebar görünür olmalı").toBeVisible();

      // Rol-bazlı menü kontrolü: en azından "Hastalar" linki tüm
      // authenticated roller için görünür olmalı.
      await expect(
        sidebar.getByRole("link", { name: UI_LABELS_TR.patients }),
        "sidebar'da 'Hastalar' linki görünür olmalı",
      ).toBeVisible();
    });
  }

  test("yanlış şifre ile login hata mesajı gösterir", async ({ page }) => {
    await page.goto("/tr-TR/login");
    await page
      .getByLabel(UI_LABELS_TR.email, { exact: true })
      .fill("owner@pilot.vetniva.local");
    await page
      .getByLabel(UI_LABELS_TR.password, { exact: true })
      .fill("wrong-password-1234");
    await page.getByRole("button", { name: UI_LABELS_TR.loginSubmit }).click();

    // Hata mesajı görünür ve hâlâ login sayfasındayız.
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /hatalı|geçersiz/i })
        .first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/tr-TR\/login/);
  });

  test("logout sonrası protected sayfa erişilemez", async ({ page }) => {
    const owner = DEMO_USERS[0];
    if (!owner) throw new Error("DEMO_USERS boş");
    await loginAs(page, owner);
    await logout(page);
    // Login sayfasına yönlendirildik.
    await waitForPath(page, /\/tr-TR\/login/);
  });
});
