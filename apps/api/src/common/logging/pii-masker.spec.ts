/**
 * @file PII masker unit testleri.
 * @module apps/api/common/logging/pii-masker.spec
 *
 * @description Her PII alanı için maskeleme kuralını doğrular.
 *   Plain text PII içeren payload testlerde görünmemeli.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import { describe, expect, it } from "vitest";

import { PiiMasker } from "./pii-masker.js";

describe("PiiMasker", () => {
  const masker = new PiiMasker("test-salt");

  describe("Direct identifiers", () => {
    it("first_name: ilk harf + ***", () => {
      expect(masker.mask({ first_name: "Ali" })).toEqual({
        first_name: "A***",
      });
    });

    it("last_name: ilk harf + ***", () => {
      expect(masker.mask({ last_name: "Yılmaz" })).toEqual({
        last_name: "Y***",
      });
    });

    it("full_name: parça parça maskelenir", () => {
      expect(masker.mask({ full_name: "Ali Yılmaz" })).toEqual({
        full_name: "A*** Y***",
      });
    });

    it("email: ilk harf + *** + @domain", () => {
      expect(masker.mask({ email: "ali@example.com" })).toEqual({
        email: "a***@example.com",
      });
    });

    it("phone: son 2 hane görünür", () => {
      expect(masker.mask({ phone: "05321234567" })).toEqual({
        phone: "*********67",
      });
    });

    it("tax_id (10 hane VKN): ilk 3 + *** + son 2", () => {
      expect(masker.mask({ tax_id: "1234567890" })).toEqual({
        tax_id: "123***90",
      });
    });

    it("iban: ülke kodu + ... + son 4", () => {
      expect(masker.mask({ iban: "TR120006400000011111111111" })).toEqual({
        iban: "TR12 **** **** **** 1111",
      });
    });

    it("birth_date: sadece yıl", () => {
      expect(masker.mask({ birth_date: "1990-05-12" })).toEqual({
        birth_date: "1990",
      });
    });

    it("address: son 2 parça (il/ilçe)", () => {
      expect(
        masker.mask({ address: "Atatürk Cd. No:5 D:3, Kadıköy, İstanbul" }),
      ).toEqual({ address: "Kadıköy, İstanbul" });
    });
  });

  describe("Indirect identifiers", () => {
    it("ip_address (IPv4): son oktet mask", () => {
      expect(masker.mask({ ip_address: "192.168.1.42" })).toEqual({
        ip_address: "192.168.1.***",
      });
    });

    it("ip_address (IPv6): tamamı mask", () => {
      expect(masker.mask({ ip_address: "::1" })).toEqual({
        ip_address: "***",
      });
    });

    it("user_agent: SHA-256 hash (16 hex)", () => {
      const result = masker.mask({
        user_agent: "Mozilla/5.0 (Windows NT 10.0)",
      }) as { user_agent: string };
      expect(result.user_agent).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("Auth secrets", () => {
    it("password: [redacted]", () => {
      expect(masker.mask({ password: "secret123" })).toEqual({
        password: "[redacted]",
      });
    });

    it("token: [redacted]", () => {
      expect(masker.mask({ token: "eyJhbGciOiJIUzI1NiJ9..." })).toEqual({
        token: "[redacted]",
      });
    });

    it("api_key: [redacted]", () => {
      expect(masker.mask({ api_key: "sk_test_abc" })).toEqual({
        api_key: "[redacted]",
      });
    });
  });

  describe("Nested & array handling", () => {
    it("Nested objelerde PII maskelenir", () => {
      const input = {
        user: {
          first_name: "Ali",
          email: "ali@example.com",
          role: "OWNER",
        },
      };
      expect(masker.mask(input)).toEqual({
        user: {
          first_name: "A***",
          email: "a***@example.com",
          role: "OWNER",
        },
      });
    });

    it("Array içindeki objelerde PII maskelenir", () => {
      const input = {
        owners: [
          { first_name: "Ali", email: "a@e.com" },
          { first_name: "Veli", email: "v@e.com" },
        ],
      };
      expect(masker.mask(input)).toEqual({
        owners: [
          { first_name: "A***", email: "a***@e.com" },
          { first_name: "V***", email: "v***@e.com" },
        ],
      });
    });

    it("null ve undefined korunur", () => {
      expect(masker.mask({ first_name: null })).toEqual({ first_name: null });
      expect(masker.mask({ first_name: undefined })).toEqual({});
    });
  });

  describe("Plain text sızıntısı kontrolü", () => {
    it("PII içeren payload'ın plain text parçası kalmaz", () => {
      const input = {
        first_name: "SecretName",
        email: "secret@private.com",
        phone: "05320001111",
      };
      const result = JSON.stringify(masker.mask(input));
      expect(result).not.toContain("SecretName");
      expect(result).not.toContain("secret@private.com");
      expect(result).not.toContain("05320001111");
    });
  });
});
