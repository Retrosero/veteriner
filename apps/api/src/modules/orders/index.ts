/**
 * @file Orders modülü public API.
 * @module apps/api/modules/orders
 *
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
 */

export { OrdersModule } from "./orders.module.js";
export { OrdersService } from "./orders.service.js";
export { OrdersController } from "./orders.controller.js";
export {
  OrdersRepository,
  type OrderRecord,
  toOrder,
} from "./orders.repository.js";
