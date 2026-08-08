/**
 * @file Playwright smoke test konfigürasyonu (GOAL-127).
 * @module @vetniva/web/playwright.config
 *
 * @description Production/pilot deploy sonrası otomatik çalışan
 * tarayıcı tabanlı smoke testler için Playwright ayarları. Bu
 * konfigürasyon:
 *
 * - `SMOKE_BASE_URL` ortam değişkeniyle hedef URL'i alır
 *   (varsayılan: pilot URL'i). `workflow_dispatch` ve
 *   `repository_dispatch` ile CI tarafında override edilir.
 * - `apps/web/e2e/smoke/` altındaki `*.spec.ts` senaryolarını çalıştırır.
 * - HTML + GitHub Actions reporter'ları üretir; başarısız testlerde
 *   video/trace/screenshot saklanır.
 * - Test paralelliğini kapatır; pilot ortamında paylaşılan veri
 *   üzerinde race condition oluşmasını engeller.
 *
 * Çalıştırma (CI tarafında):
 * ```bash
 * pnpm dlx @playwright/test@1.49.1 install --with-deps chromium
 * pnpm dlx @playwright/test@1.49.1 test \
 *   --config=apps/web/playwright.config.ts
 * ```
 *
 * Bu dosya `@playwright/test` paketine bağımlıdır; paket
 * `pnpm dlx` ile çalışma zamanında indirilir, `package.json`'a
 * eklenmez (bkz. GOAL-127 "Yeni paket bağımlılığı yok" kuralı).
 * @security Kimlik bilgileri yalnızca local environment veya CI
 * secret'larından gelir; test kaynaklarında sabit parola tutulmaz.
 * @since GOAL-127 (FAZ-12) production release gate
 */

import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test hedef URL'i. CI ortamında `SMOKE_BASE_URL` secret
 * olarak override edilir; lokal çalıştırmada pilot URL'i kullanılır.
 */
const PORTAL_BASE =
  process.env["SMOKE_BASE_URL"] ?? "https://vetniva.appsgo.cloud/";

export default defineConfig({
  /**
   * Smoke test senaryolarının bulunduğu dizin. `playwright.config.ts`
   * `apps/web/` altında olduğu için göreceli yol yeterlidir.
   */
  testDir: "./e2e/smoke",

  /**
   * Test çalıştırma zaman aşımı (ms). Pilot ortamında ortalama
   * senaryo süresi 5-10 sn; kararlı bir bütçe olarak 30 sn
   * belirlendi.
   */
  timeout: 30_000,

  /**
   * `expect()` çağrıları için varsayılan zaman aşımı.
   */
  expect: {
    timeout: 5_000,
  },

  /**
   * Pilot ortamında paylaşılan tenant verisi üzerinde yarış koşulu
   * oluşmasını engellemek için testler sıralı çalışır. Production
   * gate'i için ödünleşim kabul edilebilir.
   */
  fullyParallel: false,
  workers: 1,

  /**
   * Pilot verisi üzerinde tekrar çalıştırma, yan etki yaratabilir
   * (örn. muayene iki kez oluşturulur). 0 = retry yok.
   */
  retries: 0,

  /**
   * Raporlama: HTML (artifact), GitHub Actions (PR özeti), liste
   * (konsol çıktısı).
   */
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["github"],
    ["list"],
  ],

  /**
   * Tarayıcı bağlamı için paylaşılan ayarlar.
   */
  use: {
    baseURL: PORTAL_BASE,

    /**
     * Headless zorunlu (CI); lokal hata ayıklamada env override
     * edilebilir.
     */
    headless: true,

    /**
     * Pilot sayfaları Türkçe. Testlerde bu varsayım kullanılır;
     * istenirse `LOCALE` env ile override edilebilir.
     */
    locale: "tr-TR",

    /**
     * Sadece başarısız testlerde screenshot/video saklanır; CI
     * artifact maliyetini düşürür.
     */
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",

    /**
     * Kararlı network koşulları için kısa bir navigation timeout.
     */
    navigationTimeout: 15_000,
  },

  /**
   * Şimdilik tek proje (chromium). FAZ-13 ile birlikte firefox
   * ve webkit projeleri eklenebilir.
   */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
