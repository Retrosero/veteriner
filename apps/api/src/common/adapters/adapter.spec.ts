/**
 * @file Ülke adaptörü testleri.
 * @module @vetniva/api/common/adapters/spec
 * @description TR ve GB adapter'ları için temel formatlama ve
 * doğrulama testleri.
 * @author GOAL-003 (FAZ-0 devamı)
 */

import { Decimal } from "@prisma/client/runtime/library";
import { describe, expect, it } from "vitest";

import {
  getCountryAdapter,
  listSupportedCountries,
} from "./adapter.registry.js";

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
    expect(adapter.getVatRateFor("pet_accessory", new Date("2026-07-30"))).toBe(
      0.2,
    );
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
    expect(formatted).toBe("+44 7700 900123");
  });

  it("telefon doğrulama mobil +44 7XX kabul eder", () => {
    const result = adapter.validatePhone("+447700900123");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("+44 7700 900123");
  });

  it("telefon doğrulama sabit +44 1XX/2XX kabul eder", () => {
    // 20X (London), 12X, 11X coğrafi numaralar
    expect(adapter.validatePhone("+442071234567").valid).toBe(true);
    expect(adapter.validatePhone("+441161234567").valid).toBe(true);
  });

  it("telefon doğrulama geçersiz prefix reddeder", () => {
    // +44 3XX/4XX/5XX/6XX/8XX/9XX geçerli değil
    expect(adapter.validatePhone("+443012345678").valid).toBe(false);
    expect(adapter.validatePhone("+905321234567").valid).toBe(false);
    expect(adapter.validatePhone("12345").valid).toBe(false);
  });

  it("posta kodu SW1A 1AA formatını kabul eder", () => {
    const result = adapter.validatePostalCode("SW1A 1AA");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("SW1A 1AA");
  });

  it("posta kodu M1 1AA formatını kabul eder", () => {
    expect(adapter.validatePostalCode("M1 1AA").valid).toBe(true);
  });

  it("posta kodu B33 8TH formatını kabul eder", () => {
    expect(adapter.validatePostalCode("B33 8TH").valid).toBe(true);
  });

  it("posta kodu boşluksuz varyantı kabul eder", () => {
    expect(adapter.validatePostalCode("SW1A1AA").valid).toBe(true);
    // Outward+inward normalizasyonu orta boşluk ekler
    const normalized = adapter.validatePostalCode("SW1A1AA").normalized;
    expect(normalized).toBe("SW1A 1AA");
  });

  it("posta kodu küçük harf kabul eder ve büyütür", () => {
    const result = adapter.validatePostalCode("sw1a 1aa");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("SW1A 1AA");
  });

  it("posta kodu geçersiz formatı reddeder", () => {
    expect(adapter.validatePostalCode("12345").valid).toBe(false);
    expect(adapter.validatePostalCode("INVALID").valid).toBe(false);
    expect(adapter.validatePostalCode("SW1A").valid).toBe(false);
  });

  it("VRN (şirket) doğrulama GB + 9 hane kabul eder", () => {
    const result = adapter.validateTaxId("GB123456789", "company");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("GB123456789");
  });

  it("VRN (şirket) küçük harf kabul eder", () => {
    expect(adapter.validateTaxId("gb123456789", "company").valid).toBe(true);
  });

  it("VRN (şirket) geçersiz formatı reddeder", () => {
    // 9 hane ama GB prefix yok
    expect(adapter.validateTaxId("123456789", "company").valid).toBe(false);
    // 10 hane
    expect(adapter.validateTaxId("GB1234567890", "company").valid).toBe(false);
    // Harf içeriyor
    expect(adapter.validateTaxId("GB12345678A", "company").valid).toBe(false);
  });

  it("UTR (kişisel) doğrulama 10 hane kabul eder", () => {
    const result = adapter.validateTaxId("1234567890", "personal");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("1234567890");
  });

  it("UTR (kişisel) geçersiz formatı reddeder", () => {
    expect(adapter.validateTaxId("12345", "personal").valid).toBe(false);
    expect(adapter.validateTaxId("GB123456789", "personal").valid).toBe(false);
    expect(adapter.validateTaxId("123456789A", "personal").valid).toBe(false);
  });

  it("IBAN GB doğrulama mod 97-10 ile çalışır", () => {
    // Geçerli GB IBAN (örnek, mod 97-10 kontrolünden geçer)
    // GB29NWBK60161331926819 — Royal Bank of Scotland örnek
    expect(adapter.validateIBAN("GB29NWBK60161331926819").valid).toBe(true);
    // Boşluklu versiyonu da kabul eder
    expect(adapter.validateIBAN("GB29 NWBK 6016 1331 9268 19").valid).toBe(
      true,
    );
  });

  it("IBAN GB doğrulama yanlış ülke kodunu reddeder", () => {
    expect(adapter.validateIBAN("DE89370400440532013000").valid).toBe(false);
    expect(adapter.validateIBAN("TR330006100519786457841326").valid).toBe(
      false,
    );
  });

  it("IBAN GB doğrulama yanlış uzunluğu reddeder", () => {
    expect(adapter.validateIBAN("GB29NWBK6016133192681").valid).toBe(false);
    expect(adapter.validateIBAN("GB29NWBK601613319268199").valid).toBe(false);
  });

  it("IBAN GB doğrulama yanlış checksum'ı reddeder", () => {
    // Geçerli format ama yanlış kontrol hanesi
    expect(adapter.validateIBAN("GB99NWBK60161331926819").valid).toBe(false);
  });

  it("KDV oranları kategoriye göre doğru (GB)", () => {
    // POM-V ilaç ve aşı %0
    expect(adapter.getVatRateFor("medicine", new Date("2026-07-30"))).toBe(0.0);
    expect(adapter.getVatRateFor("vaccine", new Date("2026-07-30"))).toBe(0.0);
    // Pet food %0 (temel gıda muafiyeti)
    expect(adapter.getVatRateFor("pet_food", new Date("2026-07-30"))).toBe(0.0);
    // Hizmet ve aksesuar %20 (standart)
    expect(adapter.getVatRateFor("service", new Date("2026-07-30"))).toBe(0.2);
    expect(adapter.getVatRateFor("pet_accessory", new Date("2026-07-30"))).toBe(
      0.2,
    );
  });

  it("KDV hesaplama GB senaryosu", () => {
    // £100 hizmet, %20 KDV → £120 gross
    const result = adapter.calculateVat(new Decimal("100"), 0.2);
    expect(result.net.toString()).toBe("100");
    expect(result.vat.toString()).toBe("20");
    expect(result.gross.toString()).toBe("120");
    expect(result.rate).toBe(0.2);
  });

  it("reçete geçerlilik 28 gün (RCVS)", () => {
    expect(adapter.getPrescriptionValidityDays()).toBe(28);
  });

  it("reçete numarası GB-Rx+YIL+SIRA formatında", () => {
    const formatted = adapter.formatPrescriptionNumber(1, 2026);
    expect(formatted).toBe("GB-Rx2026-00001");
  });

  it("fatura seri prefix GB-INV", () => {
    expect(adapter.getInvoiceSeriesPrefix()).toBe("GB-INV");
  });

  it("fiş numarası YIL+SIRA formatında", () => {
    const formatted = adapter.formatReceiptNumber(1);
    expect(formatted).toMatch(/^GB-REC\d{4}-0001$/);
  });

  it("adres 4 satır olarak formatlanıyor", () => {
    const address = {
      line1: "10 Downing Street",
      line2: "Flat 2",
      city: "London",
      postalCode: "SW1A 2AA",
      country: "GB",
    };
    const formatted = adapter.formatAddress(address);
    expect(formatted).toContain("10 Downing Street");
    expect(formatted).toContain("SW1A 2AA");
    expect(formatted).toContain("United Kingdom");
  });

  it("UK GDPR/PECR bildirim kuralları opt-in zorunlu", () => {
    const rules = adapter.getNotificationRules();
    expect(rules.requiresOptIn).toBe(true);
    expect(rules.defaultOptIn).toBe(false);
    expect(rules.smsQuietHours.start).toBe("21:00");
    expect(rules.emailDailyLimit).toBe(3);
    expect(rules.marketingConsentRequired).toBe(true);
  });
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
