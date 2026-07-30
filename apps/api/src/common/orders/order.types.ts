/**
 * @file Order (klinik order) domain tipleri.
 * @module apps/api/common/orders/order.types
 *
 * @description GOAL-044 tedavi planı + klinik order domain modeli.
 * Order bir (tenant, examination, patient) üçlüsünün klinik iş
 * kalemi entity'sidir (ilaç, prosedür, lab, görüntüleme, aşı,
 * kontrol). Examination üzerinden patient + tenant kapsamı zaten
 * doğrulanır.
 *
 * Yaşam döngüsü:
 *   `pending` (create) → `in_progress` (start) → `completed`
 *   (complete). `pending` veya `in_progress` durumundan
 *   `cancelled`'a geçiş yapılabilir.
 *
 * İmza sonrası UPDATE/DELETE tetiklenir (FAZ-0'da no-op flag);
 * order kayıtları append-only / versiyonlanır.
 *
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
 */

import type {
  Order,
  OrderCancelInput,
  OrderCreateInput,
  OrderFilters,
  OrderListResponse,
  OrderStatus,
  OrderTreatmentPlan,
  OrderType,
} from "@vetniva/contracts";

export type {
  Order,
  OrderCancelInput,
  OrderCreateInput,
  OrderFilters,
  OrderListResponse,
  OrderStatus,
  OrderTreatmentPlan,
  OrderType,
};
