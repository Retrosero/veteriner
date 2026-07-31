/**
 * @file VetNiva paylaşılan sözleşmeler kök modülü.
 * @module @vetniva/contracts
 *
 * @description Bu modül API ile frontend arasındaki tek doğruluk kaynağıdır.
 * Yeni bir API endpoint'i eklendiğinde, ilgili Zod şeması ve tipleri burada
 * tanımlanmalıdır. Hem backend (request/response doğrulama) hem de frontend
 * (form/typing) bu tipleri tüketir.
 *
 * @security Sözleşmeler PII içermez; yalnızca alan isimleri ve tipleri.
 * Sözleşme değişikliği geriye dönük uyumluluk gerektirir; aksi halde
 * major version bump yapılmalıdır.
 */

export * from "./health.js";
export * from "./error.js";
export * from "./locale.js";
export * from "./tenant.js";
export * from "./branch.js";
export * from "./auth.js";
export * from "./rbac.js";
export * from "./module.js";
export * from "./file.js";
export * from "./notification.js";
export * from "./superadmin.js";
export * from "./owner.js";
export * from "./patient.js";
export * from "./ownership.js";
export * from "./alert.js";
export * from "./timeline.js";
export * from "./portal.js";
export * from "./portal-auth.js";
export * from "./portal-pet.js";
export * from "./portal-appointment-request.js";
export * from "./calendar.js";
export * from "./appointment.js";
export * from "./appointment-reminder.js";
export * from "./examination.js";
export * from "./diagnosis.js";
export * from "./vitals.js";
export * from "./soap.js";
export * from "./waitlist.js";
export * from "./order.js";
export * from "./prescription.js";
export * from "./vaccine.js";
export * from "./vaccine-application.js";
export * from "./vaccination.js";
export * from "./vaccine-card.js";
export * from "./vaccine-reminder.js";
export * from "./followup.js";
export * from "./clinical-record-share.js";
export * from "./product.js";
export * from "./inventory.js";
export * from "./supplier.js";
export * from "./purchase-order.js";
export * from "./petshop-sale.js";
export * from "./petshop-sale-return.js";
export * from "./stock-movement.js";
