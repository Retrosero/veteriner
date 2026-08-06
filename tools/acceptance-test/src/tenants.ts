/**
 * @file Capraz-tenant (coklu-tenant) pilot konfigurasyonu.
 * @module @vetniva/acceptance-test/tenants
 *
 * @description GOAL-121 (FAZ-12) kapsaminda pilot ekibin birden
 * fazla tenant uzerinde sirali olarak ayni 10 senaryoyu kosmasini
 * saglayan konfigurasyon tipi ve dogrulayicisi. JSON dosyadan
 * okunur (UAT_TENANTS_FILE env veya --tenants-file argumani).
 *
 * Not: Bu sadece sirali CLI varyantidir. Tam paralel/coklu-tenant
 * yuk testi `tools/load-test` kapsaminda FAZ-14+ ile planlanir.
 *
 * Beklenen dosya formati:
 *
 * ```json
 * [
 *   {
 *     "label": "tenant-1",
 *     "baseUrl": "http://localhost:3001",
 *     "tenantId": "11c6beec-...",
 *     "branchId": "b203d16a-...",
 *     "token": "eyJ...",
 *     "veterinarianToken": "eyJ...",
 *     "portalToken": "..."
 *   }
 * ]
 * ```
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

/** Tek bir pilot tenant konfigurasyonu. */
export interface TenantConfig {
  /** Etiket (raporda ve loglarda kullanilir). */
  label: string;
  /** API base URL; belirtilmezse global UAT_BASE_URL kullanilir. */
  baseUrl?: string;
  /** Tenant UUID (zorunlu). */
  tenantId: string;
  /** Branch UUID (zorunlu). */
  branchId: string;
  /** Staff Bearer token. */
  token: string;
  /** Opsiyonel veteriner Bearer token. */
  veterinarianToken?: string;
  /** Opsiyonel portal Bearer token. */
  portalToken?: string;
}

/** Capraz-tenant konfigurasyon dosyasi (JSON array). */
export type TenantsFile = ReadonlyArray<TenantConfig>;

/** Tek bir tenant icin dogrulama sonucu. */
export interface TenantValidationError {
  index: number;
  field: string;
  message: string;
}

/**
 * Tenant konfigurasyon dizisini dogrular. Bos dizi veya bilinmeyen
 * alan hata sayilmaz; yalnizca zorunlu alanlar kontrol edilir.
 */
export function validateTenants(
  raw: unknown,
):
  | { ok: true; value: TenantsFile }
  | { ok: false; errors: TenantValidationError[] } {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ index: -1, field: "_root", message: "JSON array bekleniyor" }],
    };
  }
  const errors: TenantValidationError[] = [];
  const value: TenantConfig[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Partial<TenantConfig> | null;
    if (!item || typeof item !== "object") {
      errors.push({ index: i, field: "_root", message: "obje bekleniyor" });
      continue;
    }
    if (typeof item.label !== "string" || item.label.length === 0) {
      errors.push({ index: i, field: "label", message: "string zorunlu" });
    }
    if (typeof item.tenantId !== "string" || item.tenantId.length === 0) {
      errors.push({ index: i, field: "tenantId", message: "string zorunlu" });
    }
    if (typeof item.branchId !== "string" || item.branchId.length === 0) {
      errors.push({ index: i, field: "branchId", message: "string zorunlu" });
    }
    if (typeof item.token !== "string" || item.token.length === 0) {
      errors.push({ index: i, field: "token", message: "string zorunlu" });
    }
    if (
      item.baseUrl !== undefined &&
      (typeof item.baseUrl !== "string" || item.baseUrl.length === 0)
    ) {
      errors.push({ index: i, field: "baseUrl", message: "string olmali" });
    }
    if (
      item.veterinarianToken !== undefined &&
      typeof item.veterinarianToken !== "string"
    ) {
      errors.push({
        index: i,
        field: "veterinarianToken",
        message: "string olmali",
      });
    }
    if (
      item.portalToken !== undefined &&
      typeof item.portalToken !== "string"
    ) {
      errors.push({ index: i, field: "portalToken", message: "string olmali" });
    }
    if (errors.filter((e) => e.index === i).length === 0) {
      // Zorunlu alanlar yukarida kontrol edildi; bu noktada hepsi string.
      value.push({
        label: item.label as string,
        baseUrl: item.baseUrl as string | undefined,
        tenantId: item.tenantId as string,
        branchId: item.branchId as string,
        token: item.token as string,
        veterinarianToken: item.veterinarianToken as string | undefined,
        portalToken: item.portalToken,
      });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value };
}
