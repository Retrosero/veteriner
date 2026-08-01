/**
 * @file Kök NestJS modülü.
 * @module apps/api
 * @description Tüm feature modüllerini birleştirir. ConfigModule zod
 * ile env doğrulaması yapar; PrismaModule global olarak PrismaService'i
 * dışa aktarır.
 *
 * Global modüller:
 * - ConfigModule (env)
 * - PrismaModule (DB)
 * - AuditModule (audit + log)
 * - ActorModule (güvenilir request actor bağlamı)
 * - AuthModule (GOAL-011 kimlik doğrulama)
 * - RbacModule (GOAL-012 RBAC ve izin motoru).
 *
 * Feature modüller:
 * - HealthModule
 * - AiModule
 * - TenantModule (FAZ-1)
 * - BranchModule (FAZ-1)
 * - IdentityModule (FAZ-1 — /me endpointleri).
 * @security AuthGuard uygulama geneli kaydedilidir; public endpoint'ler
 * `@Public()` ile açıkça işaretlenir. ActorInterceptor yalnızca guard'ın
 * ürettiği güvenilir actor bağlamını tüketir. RBAC guard
 * (`PermissionsGuard`) ilgili controller'larda zorunlu kılınır.
 */

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ActorModule } from "./common/actor/actor.module.js";
import { AuthModule } from "./common/auth/auth.module.js";
import { AiFeatureModule } from "./modules/ai/ai.module.js";
import { AlertsModule } from "./modules/alerts/alerts.module.js";
import { AnesthesiaModule } from "./modules/anesthesia/anesthesia.module.js";
import { BranchModule } from "./modules/branch/branch.module.js";
import { CalendarModule } from "./modules/calendar/calendar.module.js";
import { CashRegisterModule } from "./modules/cash-register/cash-register.module.js";
import { ClinicSalesModule } from "./modules/clinic-sales/clinic-sales.module.js";
import { ClinicalConsumptionModule } from "./modules/clinical-consumption/clinical-consumption.module.js";
import { ClinicalRecordsModule } from "./modules/clinical-records/clinical-records.module.js";
import { ClinicalUsagesModule } from "./modules/clinical-usages/clinical-usages.module.js";
import { ConsentsModule } from "./modules/consents/consents.module.js";
import { ControlledDrugsModule } from "./modules/controlled-drugs/controlled-drugs.module.js";
import { CustomerBalancesModule } from "./modules/customer-balances/customer-balances.module.js";
import { DischargeSummariesModule } from "./modules/discharge-summaries/discharge-summaries.module.js";
import { ErrorEventsModule } from "./modules/error-events/error-events.module.js";
import { EsmmModule } from "./modules/esmm/esmm.module.js";
import { ExaminationsModule } from "./modules/examinations/examinations.module.js";
import { FeatureFlagModule } from "./modules/feature-flag/feature-flag.module.js";
import { FileModule } from "./modules/file/file.module.js";
import { FollowupsModule } from "./modules/followups/followups.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { HospitalizationModule } from "./modules/hospitalization/hospitalization.module.js";
import { HospitalizationOrdersModule } from "./modules/hospitalization-orders/hospitalization-orders.module.js";
import { IdentityModule } from "./modules/identity/identity.module.js";
import { ImagingOrdersModule } from "./modules/imaging-orders/imaging-orders.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { JobRunsModule } from "./modules/job-runs/job-runs.module.js";
import { LabAdaptersModule } from "./modules/lab-adapters/lab-adapters.module.js";
import { LabOrdersModule } from "./modules/lab-orders/lab-orders.module.js";
import { LabResultsModule } from "./modules/lab-results/lab-results.module.js";
import { LabTestsModule } from "./modules/lab-tests/lab-tests.module.js";
import { LogRetentionModule } from "./modules/log-retention/log-retention.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { OnboardingFeatureModule } from "./modules/onboarding/onboarding.module.js";
import { OperationNotesModule } from "./modules/operation-notes/operation-notes.module.js";
import { OrdersModule } from "./modules/orders/orders.module.js";
import { OwnersModule } from "./modules/owners/owners.module.js";
import { OwnershipHistoryModule } from "./modules/ownership-history/ownership-history.module.js";
import { PatientsModule } from "./modules/patients/patients.module.js";
import { PetshopSaleReturnsModule } from "./modules/petshop-sale-returns/petshop-sale-returns.module.js";
import { PetshopSalesModule } from "./modules/petshop-sales/petshop-sales.module.js";
import { PortalModule } from "./modules/portal/portal.module.js";
import { PortalAppointmentsModule } from "./modules/portal-appointments/portal-appointments.module.js";
import { PortalAuthModule } from "./modules/portal-auth/portal-auth.module.js";
import { PortalPetsModule } from "./modules/portal-pets/portal-pets.module.js";
import { PrescriptionsModule } from "./modules/prescriptions/prescriptions.module.js";
import { PricingModule } from "./modules/pricing/pricing.module.js";
import { ProductsModule } from "./modules/products/products.module.js";
import { PurchaseOrdersModule } from "./modules/purchase-orders/purchase-orders.module.js";
import { RbacModule } from "./modules/rbac/rbac.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { SecurityEventsModule } from "./modules/security-events/security-events.module.js";
import { SoapModule } from "./modules/soap/soap.module.js";
import { StockAlertsModule } from "./modules/stock-alerts/stock-alerts.module.js";
import { StockMovementsModule } from "./modules/stock-movements/stock-movements.module.js";
import { SuperadminModule } from "./modules/superadmin/superadmin.module.js";
import { SuppliersModule } from "./modules/suppliers/suppliers.module.js";
import { SurgeryPlansModule } from "./modules/surgery-plans/surgery-plans.module.js";
import { TenantModule } from "./modules/tenant/tenant.module.js";
import { TimelineModule } from "./modules/timeline/timeline.module.js";
import { VaccinesModule } from "./modules/vaccines/vaccines.module.js";
import { WaitlistModule } from "./modules/waitlist/waitlist.module.js";
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
    FileModule,
    NotificationsModule,
    OwnersModule,
    PatientsModule,
    AlertsModule,
    OwnershipHistoryModule,
    SuperadminModule,
    TimelineModule,
    PortalModule,
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
    ProductsModule,
    InventoryModule,
    SuppliersModule,
    PurchaseOrdersModule,
    StockMovementsModule,
    ClinicalConsumptionModule,
    PetshopSalesModule,
    PetshopSaleReturnsModule,
    ClinicalUsagesModule,
    StockAlertsModule,
    PricingModule,
    ClinicSalesModule,
    EsmmModule,
    ReportsModule,
    CustomerBalancesModule,
    SurgeryPlansModule,
    ConsentsModule,
    ControlledDrugsModule,
    CashRegisterModule,
    AnesthesiaModule,
    OperationNotesModule,
    HospitalizationModule,
    HospitalizationOrdersModule,
    DischargeSummariesModule,
    LabTestsModule,
    LabOrdersModule,
    LabResultsModule,
    ImagingOrdersModule,
    LabAdaptersModule,
    ErrorEventsModule,
    OnboardingFeatureModule,
    JobRunsModule,
    SecurityEventsModule,
    LogRetentionModule,
  ],
})
export class AppModule {}
