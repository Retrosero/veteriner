/**
 * @file Permission kataloğu yükleyici.
 * @module apps/api/common/rbac/permission-catalog.loader
 * @since GOAL-002 (FAZ-0) yetki matrisi
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  BranchScopeFlag,
  PermissionDefinition,
  TenantScopeFlag,
} from "./permission.types.js";
import type { ActorRole } from "../actor/actor-context.service.js";

const CATALOG_RELATIVE_PATH = "docs/permissions/PERMISSION_CATALOG.yaml";

let cachedCatalog: ReadonlyArray<PermissionDefinition> | null = null;

/** İzin kataloğunu doğrulayarak yükler ve süreç önbelleğinde tutar. */
export function loadPermissionCatalog(
  workspaceRoot?: string,
): ReadonlyArray<PermissionDefinition> {
  if (cachedCatalog) return cachedCatalog;

  const root = workspaceRoot ?? findWorkspaceRoot();
  const filePath = resolve(root, CATALOG_RELATIVE_PATH);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol kontrollü workspace kökü ile sabit katalog göreli yolundan oluşturulur.
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

/** Test veya yeniden yükleme için katalog önbelleğini sıfırlar. */
export function resetPermissionCatalogCache(): void {
  cachedCatalog = null;
}

/** Ham YAML izin kaydını uygulamanın tipli izin sözleşmesine dönüştürür. */
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

/** Çalışma dizininden yukarı doğru pnpm workspace kökünü bulur. */
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

/** Dosyanın okunabilir olup olmadığını hata yaymadan denetler. */
function tryExists(p: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- p yalnızca workspace kökü taramasında resolve ile üretilir.
    readFileSync(p, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Katalog YAML'ının sınırlı şemasını bağımlılık eklemeden ayrıştırır. */
function parseCatalogYaml(raw: string): RawCatalog {
  const lines = raw.split(/\r?\n/);
  const result: RawCatalog = {};

  let inPermissions = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines.at(i) ?? "";
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
        const sub = lines.at(i) ?? "";
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
        } else if (k === "resource_type") {
          perm.resource_type = unquote(v);
        } else if (k === "action") {
          perm.action = unquote(v);
        } else if (k === "tenant_scope") {
          perm.tenant_scope = unquote(v);
        } else if (k === "branch_scope") {
          perm.branch_scope = unquote(v);
        } else if (k === "self_only") {
          perm.self_only = v === "true";
        } else if (k === "audit") {
          perm.audit = v === "true";
        } else if (k === "pii") {
          perm.pii = v === "true";
        } else if (k === "amend") {
          perm.amend = v === "true";
        } else if (k === "system_only") {
          perm.system_only = v === "true";
        } else if (k === "applies_to_roles") {
          if (v.startsWith("[")) {
            const list = v
              .replace(/^\[/, "")
              .replace(/\]$/, "")
              .split(",")
              .map((s) => unquote(s.trim()))
              .filter((s) => s.length > 0);
            perm.applies_to_roles = list;
          } else {
            const list: string[] = [];
            i++;
            while (i < lines.length) {
              const next = lines.at(i) ?? "";
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

/** YAML scalar değerinin çevre boşluk ve tırnaklarını normalize eder. */
function extractScalar(s: string): string {
  return unquote(s.trim());
}

/** Tek veya çift tırnakla çevrili scalar değerini açar. */
function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}
