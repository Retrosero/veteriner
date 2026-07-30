/**
 * @file Permission kataloğu yükleyici unit testleri.
 * @module apps/api/common/rbac/permission-catalog.loader.spec
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  loadPermissionCatalog,
  resetPermissionCatalogCache,
} from "./permission-catalog.loader.js";

describe("PermissionCatalogLoader", () => {
  beforeEach(() => {
    resetPermissionCatalogCache();
  });

  it("kataloğu yükler ve 100+ permission döner", () => {
    const defs = loadPermissionCatalog();
    expect(defs.length).toBeGreaterThan(50);
  });

  it("her permission geçerli bir anahtara sahip", () => {
    const defs = loadPermissionCatalog();
    for (const d of defs) {
      const parts = d.key.split(":");
      expect(parts.length).toBeGreaterThanOrEqual(2);
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0);
      }
      expect(d.key).toMatch(/^[a-z_]+(:[a-z_]+)+$/);
    }
  });

  it("duplicate permission anahtarı yok", () => {
    const defs = loadPermissionCatalog();
    const keys = defs.map((d) => d.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("tüm permission'lar bilinen bir role atanmış", () => {
    const defs = loadPermissionCatalog();
    const knownRoles = new Set([
      "SUPERADMIN",
      "OWNER",
      "VETERINARIAN",
      "STAFF",
      "PET_OWNER_PORTAL",
    ]);
    for (const d of defs) {
      for (const role of d.appliesToRoles) {
        expect(knownRoles.has(role)).toBe(true);
      }
    }
  });

  it("SUPERADMIN bypass olarak tüm permission'lara sahip sayılır", () => {
    const defs = loadPermissionCatalog();
    const allHaveAtLeastOneRole = defs.every(
      (d) => d.appliesToRoles.length > 0,
    );
    expect(allHaveAtLeastOneRole).toBe(true);
  });

  it("önbellekleme: ikinci çağrı aynı sonucu verir (no reload)", () => {
    const first = loadPermissionCatalog();
    const second = loadPermissionCatalog();
    expect(first).toBe(second);
  });

  it("branch_scope: required permission'lar en az bir rol tarafından kullanılabilir", () => {
    const defs = loadPermissionCatalog();
    const branchReq = defs.filter((d) => d.branchScope === "required");
    expect(branchReq.length).toBeGreaterThan(0);
    for (const d of branchReq) {
      expect(d.appliesToRoles.length).toBeGreaterThan(0);
    }
  });

  it("self_only permission'lar yalnızca portal rolüne atanır", () => {
    const defs = loadPermissionCatalog();
    const selfOnly = defs.filter((d) => d.selfOnly);
    for (const d of selfOnly) {
      expect(d.appliesToRoles.length).toBeGreaterThan(0);
    }
  });
});
