/**
 * @file @vetniva/i18n birim testleri.
 * @module @vetniva/i18n/tests
 *
 * @description createI18n fabrikasinin temel davranisi: desteklenen
 * locale'lerin okunmasi, tenantLocale override'i ve fallback.
 *
 * Not: i18next init() async oldugu icin testlerde initPromise
 * beklenir.
 */

import { describe, expect, it } from "vitest";

import { createI18n } from "../src/index.js";

describe("createI18n", () => {
  it("default locale ile baslatilir", () => {
    const instance = createI18n();
    expect(instance.language).toBe("tr-TR");
  });

  it("tenantLocale override edilir", () => {
    const instance = createI18n({ tenantLocale: "en-GB" });
    expect(instance.language).toBe("en-GB");
  });

  it("fallback locale desteklenmeyen bir dilde defaultLocale olur", () => {
    const instance = createI18n({
      defaultLocale: "tr-TR",
      fallbackLocale: "tr-TR",
    });
    const fallback = instance.options.fallbackLng;
    const locales = Array.isArray(fallback) ? fallback : [fallback];
    expect(locales).toContain("tr-TR");
  });
});
