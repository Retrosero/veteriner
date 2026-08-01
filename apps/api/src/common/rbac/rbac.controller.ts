/**
 * @file RBAC controller.
 * @module apps/api/common/rbac/rbac.controller
 * @description VetNiva RBAC REST API. Aktif kullanıcının kendi
 * permission/üyelik bilgilerini sorgulaması, tenant üyelik
 * yönetimi (OWNER) ve aktif branch context değişimi için
 * endpoint'ler.
 *
 * Endpoint'ler:
 * - `GET    /api/v1/rbac/me/permissions`           — Aktif permission listesi.
 * - `GET    /api/v1/rbac/me/memberships`           — Aktif üyelikler.
 * - `GET    /api/v1/rbac/tenants/:tenantId/users`  — Tenant üyelerini listele.
 * - `POST   /api/v1/rbac/tenants/:tenantId/users`  — Kullanıcıya rol ata.
 * - `DELETE /api/v1/rbac/tenants/:tenantId/users/:userId` — Üyeliği iptal et.
 * - `PUT    /api/v1/rbac/me/branch`                — Aktif branch context değiştir.
 * @security Tüm endpoint'ler `PermissionsGuard` ve `@RequirePermission`
 *   ile korunur. Tenant ID URL'den gelir; actor.tenantId ile eşleşmeli
 *   veya actor SUPERADMIN olmalı. Cross-tenant denemesi → 403.
 * @since GOAL-012 (FAZ-1) RBAC ve izin motoru
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { PermissionsGuard } from "./permissions.guard.js";
import { RbacService } from "./rbac.service.js";
import { RequirePermission } from "./require-permission.decorator.js";

import type { ActorContext } from "../actor/actor-context.service.js";
import type {
  AssignMembershipRequest,
  AssignMembershipResponse,
  MembershipListResponse,
  MyMembershipsResponse,
  MyPermissionsResponse,
  SwitchBranchRequest,
  SwitchBranchResponse,
} from "@vetniva/contracts";
import type { Request } from "express";

@ApiTags("rbac")
@UseGuards(PermissionsGuard)
@Controller("api/v1/rbac")
export class RbacController {
  public constructor(private readonly rbac: RbacService) {}

  @Get("me/permissions")
  @RequirePermission("common:profile:read")
  @ApiOperation({
    operationId: "rbacMyPermissions",
    summary: "Aktif kullanıcının permission listesi",
  })
  @ApiResponse({ status: 200, description: "Permission listesi döner." })
  public async myPermissions(
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<MyPermissionsResponse> {
    const actor = this.requireActor(request);
    return this.rbac.getMyPermissions(actor);
  }

  @Get("me/memberships")
  @RequirePermission("common:profile:read")
  @ApiOperation({
    operationId: "rbacMyMemberships",
    summary: "Aktif kullanıcının üyelikleri",
  })
  public async myMemberships(
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<MyMembershipsResponse> {
    const actor = this.requireActor(request);
    return this.rbac.getMyMemberships(actor);
  }

  @Get("tenants/:tenantId/users")
  @RequirePermission("user:user:read")
  @ApiOperation({
    operationId: "rbacListTenantUsers",
    summary: "Tenant üyelerini listele",
  })
  public async listTenantUsers(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<MembershipListResponse> {
    const actor = this.requireActor(request);
    return this.rbac.listMemberships(tenantId, actor);
  }

  @Post("tenants/:tenantId/users")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission("user:user:assign_role")
  @ApiOperation({
    operationId: "rbacAssignTenantUser",
    summary: "Kullanıcıya tenant rolü ata",
  })
  @ApiResponse({ status: 201, description: "Üyelik atandı." })
  @ApiResponse({ status: 403, description: "Yetkisiz." })
  @ApiResponse({
    status: 404,
    description: "Tenant veya kullanıcı bulunamadı.",
  })
  @ApiResponse({
    status: 409,
    description: "Kendine rol atama veya son OWNER iptali.",
  })
  public async assignTenantUser(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() body: AssignMembershipRequest,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<AssignMembershipResponse> {
    const actor = this.requireActor(request);
    return this.rbac.assignMembership(tenantId, body, actor);
  }

  @Delete("tenants/:tenantId/users/:userId")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("user:user:suspend")
  @ApiOperation({
    operationId: "rbacRevokeTenantUser",
    summary: "Kullanıcının tenant üyeliğini iptal et",
  })
  public async revokeTenantUser(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<{ revoked: true; membershipId: string }> {
    const actor = this.requireActor(request);
    return this.rbac.revokeMembership(tenantId, userId, actor);
  }

  @Put("me/branch")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("common:profile:update")
  @ApiOperation({
    operationId: "rbacSwitchBranch",
    summary: "Aktif branch context değiştir",
  })
  public async switchBranch(
    @Body() body: SwitchBranchRequest,
    @Req()
    request: Request & {
      actor?: ActorContext;
      authSession?: { userId: string; sessionId: string };
    },
  ): Promise<SwitchBranchResponse> {
    const actor = this.requireActor(request);
    const sessionId = this.extractSessionId(request);
    return this.rbac.switchBranch(sessionId, body.branchId, actor);
  }

  private requireActor(
    request: Request & { actor?: ActorContext },
  ): ActorContext {
    if (!request.actor) {
      throw new Error("Actor bilgisi eksik");
    }
    return request.actor;
  }

  private extractSessionId(
    request: Request & {
      authSession?: { userId: string; sessionId: string };
    },
  ): string {
    if (request.authSession?.sessionId) {
      return request.authSession.sessionId;
    }
    const headerVal = request.header("x-session-id");
    if (headerVal) return headerVal;
    throw new Error("Session ID bulunamadı");
  }
}
