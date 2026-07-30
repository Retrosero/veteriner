/**
 * @file Permission kataloğu yükleyici.
 * @module apps/api/common/rbac/permission-catalog.loader
 *
 * @since GOAL-002 (FAZ-0) yetki matrisi
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ActorRole } from "../actor/actor-context.service.js";
import type {
  BranchScopeFlag,
  PermissionDefinition,
  TenantScopeFlag,
} from "./permission.types.js";

const CATALOG_RELATIVE_PATH = "docs/permissions/PERMISSION_CATALOG.yaml";

let cachedCatalog: ReadonlyArray<PermissionDefinition> | null = null;

export function loadPermissionCatalog(
  workspaceRoot?: string,
): ReadonlyArray<PermissionDefinition> {
  if (cachedCatalog) return cachedCatalog;

  const root = workspaceRoot ?? findWorkspaceRoot();
  const filePath = resolve(root, CATALOG_RELATIVE_PATH);
  const raw = readFileSync(filePath, "utf-8");

  const parsed = parseCatalogYaml(raw);
  const list = parsed.permissions ?? [];

  const seen = new Set<string>();
  const knownRoles: ReadonlySet<ActorRole> = new Set<ActorRole>([
    "SUPERADMIN",
    "OWNER",
    "VETERINARIAN",
    "STAFF",
    "PET_OWNER_PORTAL",
    "SYSTEM",
  ]);
  for (const p of list) {
    if (seen.has(p.permission)) {
      throw new Error(
        `Permission kataloğu: tekrar eden anahtar: ${p.permission}`,
      );
    }
    seen.add(p.permission);
    for (const r of p.applies_to_roles ?? []) {
      if (!knownRoles.has(r as ActorRole)) {
        throw new Error(
          `Permission kataloğu: bilinmeyen rol ${r} (${p.permission})`,
        );
      }
    }
  }

  cachedCatalog = list.map(toDefinition);
  return cachedCatalog;
}

export function resetPermissionCatalogCache(): void {
  cachedCatalog = null;
}

function toDefinition(p: RawPermission): PermissionDefinition {
  return {
    key: p.permission,
    description: p.description,
    resourceType: p.resource_type,
    action: p.action,
    tenantScope: (p.tenant_scope ?? "not_required") as TenantScopeFlag,
    branchScope: (p.branch_scope ?? "not_required") as BranchScopeFlag,
    selfOnly: !!p.self_only,
    audit: !!p.audit,
    pii: !!p.pii,
    amend: !!p.amend,
    systemOnly: !!p.system_only,
    appliesToRoles: (p.applies_to_roles ?? []) as ReadonlyArray<ActorRole>,
  };
}

interface RawPermission {
  permission: string;
  description: string;
  resource_type: string;
  action: string;
  tenant_scope?: string;
  branch_scope?: string;
  self_only?: boolean;
  audit?: boolean;
  pii?: boolean;
  amend?: boolean;
  system_only?: boolean;
  applies_to_roles?: string[];
}

interface RawCatalog {
  permissions?: RawPermission[];
}

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (
      tryExists(resolve(dir, CATALOG_RELATIVE_PATH)) ||
      tryExists(resolve(dir, "package.json"))
    ) {
      if (tryExists(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function tryExists(p: string): boolean {
  try {
    readFileSync(p, "utf-8");
    return true;
  } catch {
    return false;
  }
}

function parseCatalogYaml(raw: string): RawCatalog {
  const lines = raw.split(/\r?\n/);
  const result: RawCatalog = {};

  let inPermissions = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    if (!inPermissions) {
      if (trimmed === "permissions:") {
        inPermissions = true;
        i++;
        continue;
      }
      i++;
      continue;
    }

    if (trimmed.startsWith("- permission:")) {
      const perm: RawPermission = {
        permission: extractScalar(trimmed.substring("- permission:".length)),
        description: "",
        resource_type: "",
        action: "",
      };
      i++;
      while (i < lines.length) {
        const sub = lines[i] ?? "";
        const subTrim = sub.trim();
        if (subTrim === "" || subTrim.startsWith("#")) {
          i++;
          continue;
        }
        if (subTrim.startsWith("- permission:")) break;
        if (!sub.startsWith("  ")) break;
        const kv = subTrim.match(/^([a-z_]+):\s*(.*)$/);
        if (!kv) {
          i++;
          continue;
        }
        const k = kv[1] ?? "";
        const v = (kv[2] ?? "").trim();
        if (k === "description") {
          perm.description = unquote(v);
        } else if (
          k === "resource_type" ||
          k === "action" ||
          k === "tenant_scope" ||
          k === "branch_scope"
        ) {
          (perm as unknown as Record<string, string>)[k] = unquote(v);
        } else if (
          k === "self_only" ||
          k === "audit" ||
          k === "pii" ||
          k === "amend" ||
          k === "system_only"
        ) {
          (perm as unknown as Record<string, boolean>)[k] = v === "true";
        } else if (k === "applies_to_roles") {
          if (v.startsWith("[")) {
            const list = v
              .replace(/^\[/, "")
              .replace(/\]$/, "")
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            perm.applies_to_roles = list;
          } else {
            const list: string[] = [];
            i++;
            while (i < lines.length) {
              const next = lines[i] ?? "";
              const nextTrim = next.trim();
              if (nextTrim === "" || nextTrim.startsWith("#")) {
                i++;
                continue;
              }
              if (!next.startsWith("    ")) break;
              const itemMatch = nextTrim.match(/^-\s*(.+)$/);
              if (itemMatch) list.push((itemMatch[1] ?? "").trim());
              i++;
            }
            perm.applies_to_roles = list;
            continue;
          }
        }
        i++;
      }
      if (!result.permissions) result.permissions = [];
      result.permissions.push(perm);
      continue;
    }
    i++;
  }
  return result;
}

function extractScalar(s: string): string {
  return unquote(s.trim());
}

function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}
