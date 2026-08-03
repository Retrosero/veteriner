/**
 * @file Worker PII maskeleyicisi testleri.
 * @module @vetniva/worker/observability/pii-masker.spec
 * @description Kalıcı job kayıtlarına doğrudan veya serbest metin PII
 * sızmadığını doğrular.
 * @security Test verileri tamamen sentetiktir.
 */

import { describe, expect, it } from "vitest";

import { maskWorkerPayload, maskWorkerString } from "./pii-masker.js";

describe("maskWorkerString", () => {
  it("serbest metindeki yaygın PII değerlerini maskeler", () => {
    const value = maskWorkerString(
      "user@example.com 05551234567 12345678901 TR330006100519786457841326",
    );

    expect(value).not.toContain("user@example.com");
    expect(value).not.toContain("05551234567");
    expect(value).not.toContain("12345678901");
    expect(value).not.toContain("TR330006100519786457841326");
  });
});

describe("maskWorkerPayload", () => {
  it("camelCase dahil hassas anahtarları iç içe payload'da redakte eder", () => {
    const payload = {
      email: "user@example.com",
      nested: { refreshToken: "very-secret", note: "Ara: 05551234567" },
      items: [{ fullName: "Ayşe Yılmaz" }],
    };

    const result = maskWorkerPayload(payload) as typeof payload;
    expect(result.email).toBe("[redacted]");
    expect(result.nested.refreshToken).toBe("[redacted]");
    expect(result.items[0]?.fullName).toBe("[redacted]");
    expect(result.nested.note).not.toContain("05551234567");
    expect(payload.email).toBe("user@example.com");
  });
});
