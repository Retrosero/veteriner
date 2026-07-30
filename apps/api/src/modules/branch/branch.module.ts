/**
 * @file Branch modülü.
 * @module apps/api/modules/branch/branch.module
 *
 * @description Branch feature modülü. Controller, service ve
 * repository DI'a eklenir.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Module } from "@nestjs/common";

import { BranchController } from "./branch.controller.js";
import { BranchRepository } from "./branch.repository.js";
import { BranchService } from "./branch.service.js";

@Module({
  controllers: [BranchController],
  providers: [BranchService, BranchRepository],
  exports: [BranchService, BranchRepository],
})
export class BranchModule {}
