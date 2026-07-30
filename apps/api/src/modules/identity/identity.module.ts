/**
 * @file Identity modülü.
 * @module apps/api/modules/identity/identity.module
 *
 * @description Oturum açmış kullanıcının self-service endpoint'leri.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "../../common/auth/auth.module.js";
import { IdentityController } from "./identity.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [IdentityController],
})
export class IdentityModule {}
