/**
 * @file ControlledDrugsController güvenlik yapılandırması testi.
 * @module apps/api/modules/controlled-drugs/controlled-drugs.controller.spec
 * @description Kontrollü ilaç endpoint'lerinin permission kontrolünden önce
 * doğrulanmış bir oturum zorunlu tuttuğunu metadata üzerinden doğrular.
 * Tenant ve actor bilgisi HTTP header'ından türetilmemelidir.
 */

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { ControlledDrugsController } from "./controlled-drugs.controller.js";
import { AuthGuard } from "../../common/auth/auth.guard.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";

describe("ControlledDrugsController guard yapılandırması", () => {
  it("permission değerlendirmesinden önce session doğrulaması ister", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ControlledDrugsController,
    ) as unknown[];

    expect(guards).toEqual([AuthGuard, PermissionsGuard]);
  });
});
