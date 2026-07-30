/**
 * @file Kök NestJS modülü.
 * @module apps/api
 *
 * @description Tüm feature modüllerini birleştirir. ConfigModule zod
 * ile env doğrulaması yapar; PrismaModule global olarak PrismaService'i
 * dışa aktarır.
 *
 * Global modüller:
 * - ConfigModule (env)
 * - PrismaModule (DB)
 * - AuditModule (audit + log)
 * - ActorModule (GOAL-010 header placeholder; AuthGuard session varsa override)
 * - AuthModule (GOAL-011 kimlik doğrulama)
 * - RbacModule (GOAL-012 RBAC ve izin motoru)
 *
 * Feature modüller:
 * - HealthModule
 * - AiModule
 * - TenantModule (FAZ-1)
 * - BranchModule (FAZ-1)
 * - IdentityModule (FAZ-1 — /me endpointleri)
 *
 * @security Auth guard controller-level'ında çalışır; header
 * placeholder fallback'i ActorInterceptor'da korunur (test/dev
 * uyumu için). RBAC guard (PermissionsGuard) isteğe bağlı olarak
 * controller'larda `@UseGuards(PermissionsGuard)` ile uygulanır;
 * global guard kaydı GOAL-012 sonrası yapılabilir.
 */

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ActorModule } from "./common/actor/actor.module.js";
import { AuthModule } from "./common/auth/auth.module.js";
import { RbacModule } from "./modules/rbac/rbac.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AiFeatureModule } from "./modules/ai/ai.module.js";
import { BranchModule } from "./modules/branch/branch.module.js";
import { FilesModule } from "./modules/files/files.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { TenantModule } from "./modules/tenant/tenant.module.js";
import { FeatureFlagModule } from "./modules/feature-flag/feature-flag.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { OwnersModule } from "./modules/owners/owners.module.js";
import { PatientsModule } from "./modules/patients/patients.module.js";
import { AlertsModule } from "./modules/alerts/alerts.module.js";
import { OwnershipHistoryModule } from "./modules/ownership-history/ownership-history.module.js";
import { SuperadminModule } from "./modules/superadmin/superadmin.module.js";
import { TimelineModule } from "./modules/timeline/timeline.module.js";
import { PortalModule } from "./modules/portal/portal.module.js";
import { PortalAuthModule } from "./modules/portal-auth/portal-auth.module.js";
import { PortalPetsModule } from "./modules/portal-pets/portal-pets.module.js";
import { PortalAppointmentsModule } from "./modules/portal-appointments/portal-appointments.module.js";
import { CalendarModule } from "./modules/calendar/calendar.module.js";
import { ClinicalRecordsModule } from "./modules/clinical-records/clinical-records.module.js";
import { ExaminationsModule } from "./modules/examinations/examinations.module.js";
import { SoapModule } from "./modules/soap/soap.module.js";
import { WaitlistModule } from "./modules/waitlist/waitlist.module.js";
import { OrdersModule } from "./modules/orders/orders.module.js";
import { PrescriptionsModule } from "./modules/prescriptions/prescriptions.module.js";
import { VaccinesModule } from "./modules/vaccines/vaccines.module.js";
import { FollowupsModule } from "./modules/followups/followups.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    PrismaModule,
    ActorModule,
    AuthModule,
    RbacModule,
    HealthModule,
    AiFeatureModule,
    TenantModule,
    BranchModule,
    IdentityModule,
    FeatureFlagModule,
    FilesModule,
    NotificationsModule,
    OwnersModule,
    PatientsModule,
    AlertsModule,
    OwnershipHistoryModule,
    SuperadminModule,
    TimelineModule,
    PortalModule,
    PortalAuthModule,
    PortalAuthModule,
    PortalPetsModule,
    PortalAppointmentsModule,
    CalendarModule,
    ExaminationsModule,
    SoapModule,
    WaitlistModule,
    OrdersModule,
    PrescriptionsModule,
    VaccinesModule,
    FollowupsModule,
    ClinicalRecordsModule,
  ],
})
export class AppModule {}
