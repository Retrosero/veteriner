/**
 * @file @vetniva/ui unit testleri.
 * @module @vetniva/ui/tests
 *
 * @description cn yardımcı fonksiyonu ve bileşen varyant davranışı.
 */

import { describe, expect, it } from "vitest";

import { cn } from "../src/index.js";

describe("cn", () => {
  it("birleştirilmiş sınıfları döner", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("falsy değerleri filtreler", () => {
    expect(cn("a", false, null, undefined, 0, "b")).toBe("a b");
  });

  it("tailwind çakışmalarını çözer (p-2 + p-4 → p-4)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
