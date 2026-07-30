/**
 * @file Branch DTO ve mapper.
 * @module apps/api/modules/branch/dto
 *
 * @description Prisma Branch modeli ile API response şeması arasındaki
 * dönüşüm. `addressJson` → `address` alanına map edilir.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import type { Branch, Prisma } from "@prisma/client";

import type {
  BranchAddress,
  BranchResponse,
} from "@vetniva/contracts";

/**
 * Prisma Branch modelini API response şemasına dönüştürür.
 */
export function toBranchResponse(branch: Branch): BranchResponse {
  return {
    id: branch.id,
    tenantId: branch.tenantId,
    code: branch.code,
    name: branch.name,
    city: branch.city,
    address: parseAddress(branch.addressJson),
    phone: branch.phone,
    status: branch.status as BranchResponse["status"],
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
    archivedAt: branch.archivedAt ? branch.archivedAt.toISOString() : null,
  };
}

function parseAddress(value: Prisma.JsonValue | null): BranchAddress | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v["line1"] !== "string" || typeof v["city"] !== "string") {
    return null;
  }
  const result: BranchAddress = {
    line1: v["line1"],
    city: v["city"],
    postalCode:
      typeof v["postalCode"] === "string" ? v["postalCode"] : "",
    country: typeof v["country"] === "string" ? v["country"] : "TR",
  };
  if (typeof v["line2"] === "string") result.line2 = v["line2"];
  if (typeof v["state"] === "string") result.state = v["state"];
  return result;
}
