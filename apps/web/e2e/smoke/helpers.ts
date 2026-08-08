/**
 * @file Smoke test ortak yardımcıları.
 * @module @vetniva/web/e2e/smoke/helpers
 *
 * @description 9 adımlık smoke test paketinin ortak fonksiyon ve
 * sabitleri. Spec dosyaları bu modülden faydalanarak her senaryo
 * için kimlik doğrulama ve tenant sabitlerini paylaşır.
 *
 * Pilot ortamı (`vetniva.appsgo.cloud`) tek tenant'lıdır
 * (`pilot-vet-kadikoy`); 4 demo user + 2 hayvan seed edilmiştir.
 * Tenant izolasyonu senaryosunda `owner2` aynı tenant'ta olduğu
 * için `owner` ile aynı verileri görmelidir.
 * @security Demo kullanıcı parolaları yalnızca CI/local secret
 * ortam değişkenlerinden okunur; repoda veya test raporlarında yer almaz.
 * @since GOAL-127 (FAZ-12) production release gate
 */

import type { Page } from "@playwright/test";

/**
 * Smoke test senaryolarında kullanılan demo user rolleri.
 * `role` alanı UI beklentilerini (sidebar/role-based menü) kontrol
 * etmek için kullanılır.
 */
export type SmokeUserRole =
  "OWNER" | "VETERINARIAN" | "STAFF" | "PET_OWNER_PORTAL";

/**
 * Demo user tanımı. Pilot ortamı seed verisidir; production
 * smoke test'lerinde ayrı bir tenant/credential seti kullanılmalı.
 */
export type SmokeUser = {
  email: string;
  password: string;
  role: SmokeUserRole;
  /** Kısa etiket (log/screenshot adlandırma için). */
  label: string;
};

/** Gerekli smoke secret'ını hata mesajında değerini göstermeden çözer. */
function requiredSmokeSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required smoke test secret: ${name}`);
  }
  return value;
}

/**
 * Pilot ortamındaki 4 demo user. Sıralama, smoke test
 * `login.spec.ts` ile aynıdır; tenant izolasyon senaryosu için
 * ikinci OWNER sonda gelir.
 */
export const DEMO_USERS: ReadonlyArray<SmokeUser> = [
  {
    email: "owner@pilot.vetniva.local",
    password: requiredSmokeSecret("SMOKE_OWNER_PASSWORD"),
    role: "OWNER",
    label: "owner",
  },
  {
    email: "vet@pilot.vetniva.local",
    password: requiredSmokeSecret("SMOKE_VET_PASSWORD"),
    role: "VETERINARIAN",
    label: "vet",
  },
  {
    email: "staff@pilot.vetniva.local",
    password: requiredSmokeSecret("SMOKE_STAFF_PASSWORD"),
    role: "STAFF",
    label: "staff",
  },
  {
    email: "owner2@pilot.vetniva.local",
    password: requiredSmokeSecret("SMOKE_OWNER2_PASSWORD"),
    role: "OWNER",
    label: "owner2",
  },
] as const;

/**
 * Pilot tenant sabitleri. Cross-tenant senaryosu bu sabitlere
 * dayanır.
 */
export const PILOT_TENANT = {
  /** URL subdomain / cookie'de tenant kimliği. */
  subdomain: "pilot-vet-kadikoy",
  /** UUID; API çağrılarında gerekirse kullanılır. */
  id: "11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1",
  /** Şube kimliği (branch). */
  branchId: "b203d16a-91e2-49c0-b9d7-9bdc55fdf60d",
} as const;

/**
 * Pilot ortamındaki seed edilmiş hayvanlar. Klinik akış testinde
 * Karabaş'a muayene açılır; reçetede Maropitant kullanılır.
 */
export const PILOT_PATIENTS = {
  karabas: { name: "Karabaş", species: "dog" },
  minnos: { name: "Minnoş", species: "cat" },
} as const;

/**
 * Pilot reçetesinde kullanılan ilaç. Stok düşümü senaryosunun
 * referans noktasıdır (1 adet azalma).
 */
export const PILOT_MAROPITANT = {
  name: "Maropitant",
  dose: "16mg",
  tablets: 1,
  perDay: 1,
  durationDays: 3,
} as const;

/**
 * Spec dosyalarında kullanılan Türkçe UI etiketleri. Pilot ortamı
 * `tr-TR` varsayılan locale ile çalışır; bu sabitler test
 * seçicilerini kararlı tutar.
 */
export const UI_LABELS_TR = {
  email: "E-posta",
  password: "Şifre",
  loginSubmit: "Giriş Yap",
  dashboard: "Anasayfa",
  patients: "Hastalar",
  appointments: "Randevular",
  consultation: "Muayene",
  petshop: "Petshop",
  finance: "Finans",
  settings: "Ayarlar",
  signOut: "Çıkış",
} as const;

/**
 * Sayfanın belirli bir URL pattern'ine yönlenmesini bekler.
 * Auth sonrası yönlendirmeler tenant'a ve role'e göre değişebilir;
 * bu yüzden esnek bir regex kullanılır.
 * @param page Playwright page.
 * @param pattern URL içinde aranacak regex (örn. `/dashboard/`).
 */
export async function waitForPath(page: Page, pattern: RegExp): Promise<void> {
  await page.waitForURL(pattern, { timeout: 15_000 });
}

/**
 * Pilot ortamında email/şifre ile giriş yapar; dashboard'a
 * yönlenene kadar bekler. Hata durumunda hata mesajı görünür
 * kalır ve test fail olur (login form hata UI'ı zaten
 * `aria-describedby` ile bağlı).
 * @param page Playwright page.
 * @param user Demo user bilgisi.
 */
export async function loginAs(page: Page, user: SmokeUser): Promise<void> {
  await page.goto("/tr-TR/login");
  await page.getByLabel(UI_LABELS_TR.email, { exact: true }).fill(user.email);
  await page
    .getByLabel(UI_LABELS_TR.password, { exact: true })
    .fill(user.password);
  await page.getByRole("button", { name: UI_LABELS_TR.loginSubmit }).click();
  await waitForPath(page, /\/tr-TR\/dashboard/);
}

/**
 * Aktif oturumu kapatır. Pilot uygulamasında sidebar "Çıkış"
 * bağlantısı `/login` adresine yönlendirir; cookie temizliği
 * backend tarafında yapılır. Yeterli olduğu için basit
 * `goto('/login')` kullanılır.
 * @param page Playwright page.
 */
export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/tr-TR/login");
}
