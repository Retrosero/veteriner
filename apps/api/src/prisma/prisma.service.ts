/**
 * @file PrismaService.
 * @module apps/api/prisma
 *
 * @description Prisma Client lifecycle yönetimi. NestJS module
 * lifecycle'ına bağlanır; bağlantı `onModuleInit`'te, kapatma
 * `onModuleDestroy`'da yapılır.
 *
 * @security Tenant izolasyonu (PostgreSQL RLS) GOAL-001'de uygulanacak.
 * Şu an uygulama katmanı kontrolü bulunmuyor; veritabanına doğrudan
 * sorgu yapan testlerde dikkatli olunmalıdır.
 */

import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  public async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Prisma bağlantısı kuruldu");
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma bağlantısı kapatıldı");
  }
}
