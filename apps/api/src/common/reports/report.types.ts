/**
 * @file Temel finans raporları domain tipleri.
 * @module apps/api/common/reports/report.types
 *
 * @description GOAL-076 (FAZ-7) temel finans raporları domain
 * modeli. In-memory; production'da Prisma aggregate query'leri
 * ile değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Raporlar read-only; veri değiştirmez. Dışa aktarma audit
 *   üretir.
 *
 * @since GOAL-076 (FAZ-7) temel finans raporları core
 */

export {};
