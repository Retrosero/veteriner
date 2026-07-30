/**
 * @file RBAC tipleri.
 * @module apps/api/common/rbac/permission.types
 *
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import type { ActorRole } from "../actor/actor-context.service.js";

export type TenantScopeFlag = "required" | "not_required";
export type BranchScopeFlag = "required" | "not_required";

export interface PermissionDefinition {
  readonly key: string;
  readonly description: string;
  readonly resourceType: string;
  readonly action: string;
  readonly tenantScope: TenantScopeFlag;
  readonly branchScope: BranchScopeFlag;
  readonly selfOnly: boolean;
  readonly audit: boolean;
  readonly pii: boolean;
  readonly amend: boolean;
  readonly systemOnly: boolean;
  readonly appliesToRoles: ReadonlyArray<ActorRole>;
}

export interface PermissionDecision {
  readonly permission: string;
  readonly allowed: boolean;
  readonly reason:
    | "superadmin_bypass"
    | "role_match"
    | "system_only"
    | "self_only_mismatch"
    | "tenant_scope_required"
    | "branch_scope_required"
    | "no_role_match"
    | "system_actor";
  readonly context?: Record<string, unknown>;
}

export interface PermissionEvaluationContext {
  readonly actor: {
    actorId: string | null;
    actorType: "user" | "system";
    role: ActorRole;
    tenantId: string | null;
    branchId: string | null;
    isSuperadmin: boolean;
  };
  readonly resourceOwnerId?: string;
  readonly permission: string;
}
