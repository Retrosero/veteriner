/**
 * @file pii-masker.test.ts — PII masker unit testleri.
 * @module @vetniva/tenant-export/tests/pii-masker
 *
 * @description StandardPiiMasker'in PII alan tespiti ve
 * maskleme davranisini dogrular. Nested objeler, dizi
 * elemanlari, undefined/null degerler dahil. Tenant izolasyonu
 * ve PII kurallarina uyar.
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

import { describe, it, expect } from "vitest";

import { StandardPiiMasker, NoopPiiMasker } from "../src/pii-masker.js";

describe("StandardPiiMasker", () => {
  const masker = new StandardPiiMasker();

  it("PII alan isimlerini tespit eder", () => {
    const v = {
      firstName: "Demo",
      lastName: "Owner",
      email: "demo@vetniva.local",
      phone: "+905551111111",
      notPii: "ok",
    };
    const detected = masker.detectPiiFields(v);
    expect(detected.length).toBe(4);
    expect(detected).toContain("firstName");
    expect(detected).toContain("lastName");
    expect(detected).toContain("email");
    expect(detected).toContain("phone");
    expect(detected).not.toContain("notPii");
  });

  it("PII alanlari mask'ler (firstName, lastName, email, phone, vb.)", () => {
    const v = {
      firstName: "Demo",
      lastName: "Owner",
      email: "demo@vetniva.local",
      phone: "+905551111111",
      notPii: "ok",
    };
    const masked = masker.maskObject(v);
    expect(masked["firstName"]).not.toBe("Demo");
    expect(masked["lastName"]).not.toBe("Owner");
    expect(masked["email"]).not.toBe("demo@vetniva.local");
    expect(masked["phone"]).not.toBe("+905551111111");
    expect(masked["notPii"]).toBe("ok");
  });

  it("Nested objeleri recursive mask'ler", () => {
    const v = {
      id: "x",
      contact: { email: "a@b.c", phone: "+905551111111" },
    };
    const masked = masker.maskObject(v);
    expect(masked["id"]).toBe("x");
    const contact = masked["contact"] as Record<string, unknown>;
    expect(contact["email"]).not.toBe("a@b.c");
    expect(contact["phone"]).not.toBe("+905551111111");
  });

  it("Dizi elemanlarini (obje ise) mask'ler", () => {
    const v = {
      owners: [
        { firstName: "A", email: "a@b.c" },
        { firstName: "B", email: "b@c.d" },
      ],
    };
    const masked = masker.maskObject(v);
    const arr = masked["owners"] as Array<Record<string, unknown>>;
    expect(arr[0]!["email"]).not.toBe("a@b.c");
    expect(arr[1]!["email"]).not.toBe("b@c.d");
  });

  it("undefined / null degerleri olduigu gibi birakir", () => {
    const v = { firstName: undefined, email: null as unknown as string };
    const masked = masker.maskObject(v);
    // undefined ve null degerler icin PII alan olsa bile
    // maske uygulanmaz (anlamsiz). Olduğu gibi korunur.
    expect(masked["firstName"]).toBeUndefined();
    expect(masked["email"]).toBeNull();
  });

  it("token, password, api_key gibi auth secrets mask'lenir", () => {
    const v = {
      password: "secret123",
      token: "jwt-abc",
      api_key: "ak-xyz",
    };
    const masked = masker.maskObject(v);
    expect(masked["password"]).not.toBe("secret123");
    expect(masked["token"]).not.toBe("jwt-abc");
    expect(masked["api_key"]).not.toBe("ak-xyz");
  });

  it("buyuk/kucuk harf duyarsiz PII tespiti", () => {
    const v = {
      FirstName: "Demo",
      EMAIL: "demo@vetniva.local",
    };
    const detected = masker.detectPiiFields(v);
    expect(detected).toContain("FirstName");
    expect(detected).toContain("EMAIL");
  });

  it("kisa string'leri tamamen mask'ler (2 karakter ve alti)", () => {
    const masker2 = new StandardPiiMasker("X");
    const masked = masker2.maskObject({ email: "ab" });
    expect(masked["email"]).toBe("XX");
  });
});

describe("NoopPiiMasker", () => {
  it("PII tespit etmez, objeyi olduigu gibi doner", () => {
    const masker = new NoopPiiMasker();
    const v = { firstName: "Demo", email: "a@b.c" };
    expect(masker.detectPiiFields(v)).toEqual([]);
    expect(masker.maskObject(v)).toEqual(v);
  });
});
