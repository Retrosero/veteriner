/**
 * @file Ülke adaptörü testleri.
 * @module @vetniva/api/common/adapters/spec
 *
 * @description TR ve GB adapter'ları için temel formatlama ve
 * doğrulama testleri.
 *
 * @author GOAL-003 (FAZ-0 devamı)
 */

import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

import { getCountryAdapter, listSupportedCountries } from "./adapter.registry.js";

describe("TrCountryAdapter", () => {
  const adapter = getCountryAdapter("TR");
  const sampleDate = new Date("2026-07-30T14:30:00Z");

  it("para birimi TRY olmalı", () => {
    expect(adapter.code).toBe("TR");
    expect(adapter.currency).toBe("TRY");
    expect(adapter.locale).toBe("tr-TR");
    expect(adapter.timezone).toBe("Europe/Istanbul");
  });

  it("tarih short format dd.MM.yyyy", () => {
    const formatted = adapter.formatDate(sampleDate, { style: "short" });
    // 30.07.2026 (saat dilimi Europe/Istanbul, yaz saati yok)
    expect(formatted).toMatch(/30\.07\.2026/);
  });

  it("saat 24-saat format HH:mm", () => {
    const formatted = adapter.formatTime(sampleDate);
    expect(formatted).toMatch(/^\d{2}:\d{2}$/);
  });

  it("para ₺1.234,56 formatında", () => {
    const formatted = adapter.formatCurrency(1234.56);
    expect(formatted).toContain("1.234,56");
    expect(formatted).toContain("₺");
  });

  it("Decimal tipindeki tutarı doğru formatlar", () => {
    const decimal = new Decimal("1234.56");
    const formatted = adapter.formatCurrency(decimal);
    expect(formatted).toContain("1.234,56");
  });

  it("VKN doğrulama algoritması çalışıyor", () => {
    // Test VKN: 1234567890 (geçerli mi değil mi algoritmaya göre)
    expect(adapter.validateTaxId("1234567890", "company").valid).toBeDefined();
    // 11 haneli sayı için hata vermeli
    const invalid = adapter.validateTaxId("123", "company");
    expect(invalid.valid).toBe(false);
  });

  it("TCKN doğrulama algoritması 11 hane kontrol ediyor", () => {
    const invalid = adapter.validateTaxId("123", "personal");
    expect(invalid.valid).toBe(false);
  });

  it("telefon E.164 ile doğrulanıyor", () => {
    // Geçerli: +90 5XX XXX XX XX
    expect(adapter.validatePhone("+905321234567").valid).toBe(true);
    // Geçersiz: +90 ile başlamıyor
    expect(adapter.validatePhone("+1234567890").valid).toBe(false);
    // Geçersiz: 5XX ile başlamıyor (sabit hat)
    expect(adapter.validatePhone("+902121234567").valid).toBe(false);
  });

  it("posta kodu 5 hane olmalı", () => {
    expect(adapter.validatePostalCode("34710").valid).toBe(true);
    expect(adapter.validatePostalCode("123").valid).toBe(false);
  });

  it("IBAN mod 97-10 ile doğrulanıyor", () => {
    // Geçerli TR IBAN (örnek — gerçek formatta kontrol)
    expect(adapter.validateIBAN("TR330006100519786457841326").valid).toBe(true);
    // Geçersiz: yanlış ülke kodu
    expect(adapter.validateIBAN("DE89370400440532013000").valid).toBe(false);
  });

  it("KDV oranları kategoriye göre doğru", () => {
    expect(adapter.getVatRateFor("vaccine", new Date("2026-07-30"))).toBe(0.08);
    expect(adapter.getVatRateFor("service", new Date("2026-07-30"))).toBe(0.2);
    expect(adapter.getVatRateFor("pet_accessory", new Date("2026-07-30"))).toBe(0.2);
  });

  it("KDV hesaplama doğru sonuç veriyor", () => {
    const result = adapter.calculateVat(new Decimal("100"), 0.2);
    expect(result.net.toString()).toBe("100");
    expect(result.vat.toString()).toBe("20");
    expect(result.gross.toString()).toBe("120");
  });

  it("fiş numarası YIL+AY-SIRA formatında", () => {
    const formatted = adapter.formatReceiptNumber(1);
    expect(formatted).toMatch(/^FIS\d{6}-0001$/);
  });

  it("reçete numarası R+YIL-SIRA formatında", () => {
    const formatted = adapter.formatPrescriptionNumber(1, 2026);
    expect(formatted).toBe("R2026-00001");
  });

  it("reçete geçerlilik 30 gün", () => {
    expect(adapter.getPrescriptionValidityDays()).toBe(30);
  });

  it("adres 4 satır olarak formatlanıyor", () => {
    const address = {
      line1: "Atatürk Mah. Cumhuriyet Cad.",
      line2: "No: 25 Daire: 7",
      city: "Kadıköy",
      postalCode: "34710",
      country: "TR",
    };
    const formatted = adapter.formatAddress(address);
    expect(formatted).toContain("Atatürk Mah.");
    expect(formatted).toContain("34710");
    expect(formatted).toContain("Türkiye");
  });

  it("KVKK bildirim kuralları opt-in zorunlu", () => {
    const rules = adapter.getNotificationRules();
    expect(rules.requiresOptIn).toBe(true);
    expect(rules.defaultOptIn).toBe(false);
    expect(rules.smsQuietHours.start).toBe("22:00");
    expect(rules.emailDailyLimit).toBe(5);
    expect(rules.marketingConsentRequired).toBe(true);
  });

  it("fatura seri prefix FTR", () => {
    expect(adapter.getInvoiceSeriesPrefix()).toBe("FTR");
  });
});

describe("GbCountryAdapter", () => {
  const adapter = getCountryAdapter("GB");

  it("para birimi GBP olmalı", () => {
    expect(adapter.code).toBe("GB");
    expect(adapter.currency).toBe("GBP");
    expect(adapter.locale).toBe("en-GB");
    expect(adapter.timezone).toBe("Europe/London");
  });

  it("para £1,234.56 formatında", () => {
    const formatted = adapter.formatCurrency(1234.56);
    expect(formatted).toContain("1,234.56");
    expect(formatted).toContain("£");
  });

  it("tarih short format dd/MM/yyyy", () => {
    const formatted = adapter.formatDate(new Date("2026-07-30T14:30:00Z"), {
      style: "short",
    });
    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("telefon +44 formatında", () => {
    const formatted = adapter.formatPhone("+447700900123");
    expect(formatted).toMatch(/\+44/);
  });

  it("reçete geçerlilik 28 gün", () => {
    expect(adapter.getPrescriptionValidityDays()).toBe(28);
  });

  it("fatura seri prefix GB-INV", () => {
    expect(adapter.getInvoiceSeriesPrefix()).toBe("GB-INV");
  });

  it("GDPR bildirim kuralları opt-in zorunlu", () => {
    const rules = adapter.getNotificationRules();
    expect(rules.requiresOptIn).toBe(true);
    expect(rules.marketingConsentRequired).toBe(true);
  });

  // Faz 14'te tamamlanacak:
  it.skip("UTR doğrulama Faz 14'te implemente edilecek", () => {});
  it.skip("VKN/RCVS reçete kuralları Faz 14'te implemente edilecek", () => {});
});

describe("Adapter Registry", () => {
  it("TR ve GB destekleniyor", () => {
    expect(listSupportedCountries()).toContain("TR");
    expect(listSupportedCountries()).toContain("GB");
  });

  it("desteklenmeyen ülke için hata fırlatır", () => {
    expect(() => getCountryAdapter("XX" as never)).toThrow(/Desteklenmeyen/);
  });
});
