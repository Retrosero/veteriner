/**
 * @file PrismaModule.
 * @module apps/api/prisma
 * @description PrismaService'i global olarak dışa aktarır. Diğer
 * modüller import etmeden PrismaService'i enjekte edebilir.
 */

import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
